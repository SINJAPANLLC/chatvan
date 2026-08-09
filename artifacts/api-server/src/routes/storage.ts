/**
 * Object storage routes — presigned upload URL + file serving
 * Uses JWT/session auth compatible with requireAuth/requireAdmin middleware
 */
import { Readable } from 'stream';
import { Router, type IRouter, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middlewares/auth';
import { ObjectNotFoundError, ObjectStorageService } from '../lib/objectStorage';

const router: IRouter = Router();
const storage = new ObjectStorageService();

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

/**
 * POST /storage/uploads/request-url
 * Admin-only: request a presigned PUT URL for direct-to-GCS upload.
 */
router.post(
  '/storage/uploads/request-url',
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'name, size, contentType が必要です' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      const uploadURL = await storage.getObjectEntityUploadURL();
      const objectPath = storage.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (err) {
      console.error('[storage] presigned URL error:', err);
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
