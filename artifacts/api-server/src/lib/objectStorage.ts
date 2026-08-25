import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { File, Storage } from '@google-cloud/storage';

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from './objectAcl';

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

export const objectStorageClient = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: 'json',
        subject_token_field_name: 'access_token',
      },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class LocalUploadError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'LocalUploadError';
    Object.setPrototypeOf(this, LocalUploadError.prototype);
  }
}

export interface ObjectUploadTarget {
  uploadURL: string;
  objectPath: string;
}

interface LocalUploadTokenPayload {
  objectPath: string;
  contentType: string;
  expiresAt: number;
}

const LOCAL_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export class ObjectStorageService {
  constructor() {}

  /**
   * Production on the VPS uses LOCAL_UPLOAD_DIR. When it is absent (the
   * Replit development environment), the existing Replit object storage
   * implementation remains active.
   */
  isLocalStorageConfigured(): boolean {
    return Boolean(process.env.LOCAL_UPLOAD_DIR);
  }

  isPrivateStorageConfigured(): boolean {
    return this.isLocalStorageConfigured() || Boolean(process.env.PRIVATE_OBJECT_DIR);
  }

  getLocalUploadDir(): string {
    const dir = process.env.LOCAL_UPLOAD_DIR;
    if (!dir) {
      throw new Error('LOCAL_UPLOAD_DIR is not set.');
    }
    return path.resolve(dir);
  }

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = Array.from(
      new Set(
        pathsStr
          .split(',')
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          'tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths).',
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || '';
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          'tool and set PRIVATE_OBJECT_DIR env var.',
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(
    file: File,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === 'public';

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      'Content-Type':
        (metadata.contentType as string) || 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers['Content-Length'] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          'tool and set PRIVATE_OBJECT_DIR env var.',
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: 'PUT',
      ttlSec: 900,
    });
  }

  /**
   * Keep the existing browser contract: first obtain an upload URL, then PUT
   * file bytes to it. Replit returns a GCS signed URL; the VPS returns a
   * short-lived, HMAC-protected application URL.
   */
  async createObjectEntityUploadTarget(contentType: string): Promise<ObjectUploadTarget> {
    const normalizedContentType = contentType.split(';', 1)[0].trim().toLowerCase();
    if (!normalizedContentType) {
      throw new LocalUploadError('ファイル形式を確認できませんでした。', 400);
    }

    if (this.isLocalStorageConfigured()) {
      const objectPath = `/objects/uploads/${randomUUID()}`;
      const token = this.createLocalUploadToken({
        objectPath,
        contentType: normalizedContentType,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
      return {
        uploadURL: `/api/storage/local-uploads/${token}`,
        objectPath,
      };
    }

    const uploadURL = await this.getObjectEntityUploadURL();
    return {
      uploadURL,
      objectPath: this.normalizeObjectEntityPath(uploadURL),
    };
  }

  /**
   * Consume a short-lived local upload URL and write the request body to the
   * VPS's persistent upload directory. Object paths stay compatible with the
   * existing /objects/... values stored in the database.
   */
  async writeLocalObject(
    token: string,
    source: NodeJS.ReadableStream,
    contentType: string,
  ): Promise<string> {
    if (!this.isLocalStorageConfigured()) {
      throw new LocalUploadError('ローカルストレージは有効ではありません。', 404);
    }

    const payload = this.verifyLocalUploadToken(token);
    const normalizedContentType = contentType.split(';', 1)[0].trim().toLowerCase();
    if (normalizedContentType !== payload.contentType) {
      throw new LocalUploadError('アップロード時のファイル形式が一致しません。', 415);
    }

    const objectFilePath = this.getLocalObjectFilePath(payload.objectPath);
    await mkdir(path.dirname(objectFilePath), { recursive: true, mode: 0o750 });

    const temporaryPath = `${objectFilePath}.${randomUUID()}.tmp`;
    let uploadedBytes = 0;
    const sizeLimiter = new Transform({
      transform(chunk, _encoding, callback) {
        uploadedBytes += chunk.length;
        if (uploadedBytes > LOCAL_UPLOAD_MAX_BYTES) {
          callback(new LocalUploadError('ファイルは20MB以内にしてください。', 413));
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(source, sizeLimiter, createWriteStream(temporaryPath, { flags: 'wx', mode: 0o640 }));
      await rename(temporaryPath, objectFilePath);
      await writeFile(
        `${objectFilePath}.metadata.json`,
        JSON.stringify({ contentType: normalizedContentType, uploadedAt: new Date().toISOString() }),
        { mode: 0o640 },
      );
      return payload.objectPath;
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async downloadObjectPath(
    objectPath: string,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    if (this.isLocalStorageConfigured()) {
      return this.downloadLocalObject(objectPath, cacheTtlSec);
    }
    const file = await this.getObjectEntityFile(objectPath);
    return this.downloadObject(file, cacheTtlSec);
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (this.isLocalStorageConfigured()) {
      throw new Error('Use downloadObjectPath when LOCAL_UPLOAD_DIR is configured.');
    }
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split('/');
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join('/');
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith('/')) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith('https://storage.googleapis.com/')) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith('/')) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  private createLocalUploadToken(payload: LocalUploadTokenPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.getLocalUploadSigningSecret())
      .update(encodedPayload)
      .digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  private verifyLocalUploadToken(token: string): LocalUploadTokenPayload {
    const [encodedPayload, providedSignature, ...extraParts] = token.split('.');
    if (!encodedPayload || !providedSignature || extraParts.length > 0) {
      throw new LocalUploadError('無効なアップロードURLです。', 400);
    }

    const expectedSignature = createHmac('sha256', this.getLocalUploadSigningSecret())
      .update(encodedPayload)
      .digest('base64url');
    const provided = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new LocalUploadError('無効なアップロードURLです。', 400);
    }

    let payload: LocalUploadTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new LocalUploadError('無効なアップロードURLです。', 400);
    }

    if (
      !payload
      || typeof payload.objectPath !== 'string'
      || typeof payload.contentType !== 'string'
      || typeof payload.expiresAt !== 'number'
      || payload.expiresAt < Date.now()
    ) {
      throw new LocalUploadError('アップロードURLの有効期限が切れています。再度お試しください。', 400);
    }
    // Also rejects traversal attempts before the path is used on disk.
    this.getLocalObjectFilePath(payload.objectPath);
    return payload;
  }

  private getLocalUploadSigningSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error('SESSION_SECRET must be set for local uploads.');
    }
    return secret;
  }

  private getLocalObjectFilePath(objectPath: string): string {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }
    const relativePath = objectPath.slice('/objects/'.length);
    if (!relativePath || relativePath.includes('\0')) {
      throw new ObjectNotFoundError();
    }

    const root = this.getLocalUploadDir();
    const resolved = path.resolve(root, relativePath);
    const relativeToRoot = path.relative(root, resolved);
    if (!relativeToRoot || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
      throw new ObjectNotFoundError();
    }
    return resolved;
  }

  private async downloadLocalObject(objectPath: string, cacheTtlSec: number): Promise<Response> {
    const objectFilePath = this.getLocalObjectFilePath(objectPath);
    try {
      const fileStat = await stat(objectFilePath);
      if (!fileStat.isFile()) throw new ObjectNotFoundError();
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw error;
      throw new ObjectNotFoundError();
    }

    let contentType = 'application/octet-stream';
    try {
      const rawMetadata = await readFile(`${objectFilePath}.metadata.json`, 'utf8');
      const metadata = JSON.parse(rawMetadata) as { contentType?: unknown };
      if (typeof metadata.contentType === 'string' && metadata.contentType) {
        contentType = metadata.contentType;
      }
    } catch {
      // Objects written before metadata support can still be downloaded safely.
    }

    const fileStat = await stat(objectFilePath);
    return new Response(Readable.toWeb(createReadStream(objectFilePath)) as ReadableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileStat.size),
        'Cache-Control': `private, max-age=${cacheTtlSec}`,
      },
    });
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  const pathParts = path.split('/');
  if (pathParts.length < 3) {
    throw new Error('Invalid path: must contain at least a bucket name');
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`,
    );
  }

  const result = await response.json() as Record<string, unknown>;
  const signedURL = result['signed_url'];
  if (typeof signedURL !== 'string') {
    throw new Error('Unexpected response from sidecar: signed_url is missing or not a string');
  }
  return signedURL;
}
