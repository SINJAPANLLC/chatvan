/**
 * Object storage routes — presigned upload URL + file serving
 * Uses JWT/session auth compatible with requireAuth/requireAdmin middleware
 */
import { Readable } from 'stream';
import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin, requireRentalCompany } from '../middlewares/auth';
import { LocalUploadError, ObjectNotFoundError, ObjectStorageService } from '../lib/objectStorage';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

const router: IRouter = Router();
const storage = new ObjectStorageService();

/** Returns true when either the VPS disk or Replit private storage is configured. */
function isPrivateStorageConfigured(): boolean {
  return storage.isPrivateStorageConfigured();
}

function privateStorageUnconfiguredResponse(res: Response): void {
  res.status(503).json({ error: 'ストレージが設定されていません。管理者へお問い合わせください。' });
}

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);
const ALLOWED_VEHICLE_UPLOAD_TYPES = new Set([...ALLOWED_IMAGE_TYPES, 'application/pdf']);

/**
 * POST /storage/uploads/request-url
 * Admin-only: request a direct upload URL for vehicle photos and documents.
 */
router.post(
  '/storage/uploads/request-url',
  requireAdmin,  // ← admin only version (kept for backward compat)
  async (req: Request, res: Response): Promise<void> => {
    const { name, size, contentType } = req.body ?? {};
    if (!name || !contentType) {
      res.status(400).json({ error: 'name, size, contentType が必要です' });
      return;
    }
    if (!ALLOWED_VEHICLE_UPLOAD_TYPES.has(String(contentType).toLowerCase())) {
      res.status(400).json({ error: '画像（JPEG/PNG/WebP/HEIC）またはPDFのみアップロードできます' });
      return;
    }

    if (!isPrivateStorageConfigured()) { privateStorageUnconfiguredResponse(res); return; }

    try {
      const { uploadURL, objectPath } = await storage.createObjectEntityUploadTarget(contentType);

      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (err) {
      console.error('[storage] presigned URL error:', err);
      res.status(500).json({ error: 'アップロードURLの生成に失敗しました' });
    }
  },
);

/**
 * POST /storage/company-uploads/request-url
 * rental_company (or admin): presigned PUT URL for company vehicle photos & documents.
 * Persists a company upload claim (objectPath → companyId) for ownership enforcement.
 * Allows images and PDFs.
 */
router.post(
  '/storage/company-uploads/request-url',
  requireRentalCompany,
  async (req: Request, res: Response): Promise<void> => {
    const { name, contentType } = req.body ?? {};
    if (!name || !contentType) {
      res.status(400).json({ error: 'name, contentType が必要です' });
      return;
    }
    if (!ALLOWED_VEHICLE_UPLOAD_TYPES.has(String(contentType).toLowerCase())) {
      res.status(400).json({ error: '画像（JPEG/PNG/WebP/HEIC）またはPDFのみアップロードできます' });
      return;
    }
    if (!isPrivateStorageConfigured()) { privateStorageUnconfiguredResponse(res); return; }

    const userId: number | undefined = (req.session as any)?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const { uploadURL, objectPath } = await storage.createObjectEntityUploadTarget(contentType);

      // Resolve company_id for the uploader (rental_company users have rental_company_id)
      const userRow = await db.execute(sql`SELECT rental_company_id FROM users WHERE id = ${userId} LIMIT 1`);
      const companyId: number | null = (userRow as any).rows?.[0]?.rental_company_id
        ?? (userRow as any)[0]?.rental_company_id
        ?? null;

      // Persist claim so ownership can be verified on read
      await db.execute(sql`
        INSERT INTO upload_claims (object_path, user_id, company_id, content_type)
        VALUES (${objectPath}, ${userId}, ${companyId}, ${contentType})
        ON CONFLICT (object_path) DO NOTHING
      `);

      res.json({ uploadURL, objectPath });
    } catch (err) {
      console.error('[storage] company upload URL error:', err);
      res.status(500).json({ error: 'アップロードURLの生成に失敗しました' });
    }
  },
);

/**
 * POST /storage/user-uploads/request-url
 * Auth-required: request a presigned PUT URL for license image upload.
 * Stores an upload claim (objectPath → userId) in DB to enable ownership verification at submit time.
 */
router.post(
  '/storage/user-uploads/request-url',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { name, contentType, applicationId } = req.body ?? {};
    const userId: number | undefined = (req.session as any)?.userId;

    if (!name || !contentType) {
      res.status(400).json({ error: 'name, contentType が必要です' });
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.has(String(contentType).toLowerCase())) {
      res.status(400).json({ error: '画像ファイル（JPEG/PNG/WebP/HEIC）のみアップロードできます' });
      return;
    }
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!isPrivateStorageConfigured()) { privateStorageUnconfiguredResponse(res); return; }

    try {
      const { uploadURL, objectPath } = await storage.createObjectEntityUploadTarget(contentType);

      // Persist claim so submission can verify ownership
      await db.execute(sql`
        INSERT INTO upload_claims (object_path, user_id, application_id, content_type)
        VALUES (${objectPath}, ${userId}, ${applicationId ?? null}, ${contentType})
        ON CONFLICT (object_path) DO NOTHING
      `);

      res.json({ uploadURL, objectPath });
    } catch (err) {
      console.error('[storage] user presigned URL error:', err);
      res.status(500).json({ error: 'アップロードURLの生成に失敗しました' });
    }
  },
);

/**
 * PUT /storage/local-uploads/:token
 * VPS-only short-lived upload destination. The token carries an HMAC-signed
 * object path and content type, so it can accept raw bytes without a browser
 * session while remaining limited to an expiring upload target.
 */
router.put(
  '/storage/local-uploads/:token',
  async (req: Request, res: Response): Promise<void> => {
    if (!storage.isLocalStorageConfigured()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!contentType) {
      res.status(400).json({ error: 'ファイル形式を確認できませんでした。' });
      return;
    }

    try {
      const rawToken = req.params.token;
      const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
      if (!token) {
        res.status(400).json({ error: '無効なアップロードURLです。' });
        return;
      }
      await storage.writeLocalObject(token, req, contentType);
      res.status(204).end();
    } catch (err) {
      if (err instanceof LocalUploadError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('[storage] local upload error:', err);
      res.status(500).json({ error: 'ファイルの保存に失敗しました。' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 * Publicly serve assets from PUBLIC_OBJECT_SEARCH_PATHS.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await storage.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const response = await storage.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      console.error('[storage] public object error:', err);
      res.status(500).json({ error: 'Failed to serve object' });
    }
  },
);

/**
 * GET /storage/user-objects/*
 * Serve private object entities for authenticated users (not admin-only).
 * Only the upload_claim owner or an admin may read the object.
 */
router.get(
  '/storage/user-objects/*objectPath',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (!isPrivateStorageConfigured()) { privateStorageUnconfiguredResponse(res); return; }
    try {
      const raw = req.params.objectPath;
      const objectPath = '/objects/' + (Array.isArray(raw) ? raw.join('/') : raw);

      const userId: number | undefined = (req.session as any)?.userId;
      const userRole: string | undefined = (req.session as any)?.userRole;

      // Admin may always access; others must own the upload claim (by user_id or company_id)
      if (userRole !== 'admin') {
        if (!userId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        // Resolve company_id for rental_company users
        let companyId: number | null = null;
        if (userRole === 'rental_company') {
          const userRow = await db.execute(sql`SELECT rental_company_id FROM users WHERE id = ${userId} LIMIT 1`);
          companyId = (userRow as any).rows?.[0]?.rental_company_id
            ?? (userRow as any)[0]?.rental_company_id
            ?? null;
        }

        // Grant access if: user uploaded it (personal upload) OR user's company owns it (company upload)
        const claimRows = await db.execute(sql`
          SELECT 1 FROM upload_claims
          WHERE object_path = ${objectPath}
            AND (
              user_id = ${userId}
              OR (${companyId}::int IS NOT NULL AND company_id = ${companyId})
            )
          LIMIT 1
        `);
        const hasClaim = !!((claimRows as any).rows?.[0] ?? (claimRows as any)[0]);
        if (!hasClaim) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }

      const response = await storage.downloadObjectPath(objectPath);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      console.error('[storage] user-object serve error:', err);
      res.status(500).json({ error: 'Failed to serve object' });
    }
  },
);

/**
 * GET /storage/objects/*
 * Serve private object entities (auth required).
 */
router.get(
  '/storage/objects/*objectPath',
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    if (!isPrivateStorageConfigured()) { privateStorageUnconfiguredResponse(res); return; }
    try {
      const raw = req.params.objectPath;
      const objectPath = '/objects/' + (Array.isArray(raw) ? raw.join('/') : raw);
      const response = await storage.downloadObjectPath(objectPath);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      console.error('[storage] object serve error:', err);
      res.status(500).json({ error: 'Failed to serve object' });
    }
  },
);

export default router;
