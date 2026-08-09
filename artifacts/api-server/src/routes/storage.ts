/**
 * Object storage routes — presigned upload URL + file serving
 * Uses JWT/session auth compatible with requireAuth/requireAdmin middleware
 */
import { Readable } from 'stream';
import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth';
import { ObjectNotFoundError, ObjectStorageService } from '../lib/objectStorage';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

const router: IRouter = Router();
const storage = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 * Admin-only: request a presigned PUT URL for direct-to-GCS upload.
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

    try {
      const uploadURL = await storage.getObjectEntityUploadURL();
      const objectPath = storage.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (err) {
      console.error('[storage] presigned URL error:', err);
      res.status(500).json({ error: 'アップロードURLの生成に失敗しました' });
    }
  },
);

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);

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
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      res.status(400).json({ error: '画像ファイル（JPEG/PNG/WebP/HEIC）のみアップロードできます' });
      return;
    }
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const uploadURL = await storage.getObjectEntityUploadURL();
      const objectPath = storage.normalizeObjectEntityPath(uploadURL);

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
 * GET /storage/objects/*
 * Serve private object entities (auth required).
 */
router.get(
  '/storage/objects/*objectPath',
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.params.objectPath;
      const objectPath = '/objects/' + (Array.isArray(raw) ? raw.join('/') : raw);
      const file = await storage.getObjectEntityFile(objectPath);
      const response = await storage.downloadObject(file);
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
