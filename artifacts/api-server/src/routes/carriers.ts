import { Router, type IRouter } from "express";
import { db, carriersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
// Zod schemas removed in Chat VAN migration
type CreateCarrierBody = any;
type UpdateCarrierBody = any;
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatCarrier(c: any) {
  return {
    ...c,
    averageCost: c.averageCost ? Number(c.averageCost) : null,
    onTimeRate: c.onTimeRate ? Number(c.onTimeRate) : null,
    rating: c.rating ? Number(c.rating) : null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  };
}

router.get("/carriers", requireAuth, async (_req, res): Promise<void> => {
  const carriers = await db.select().from(carriersTable).orderBy(carriersTable.companyName);
  res.json(carriers.map(formatCarrier));
});

router.post("/carriers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCarrierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [carrier] = await db.insert(carriersTable).values(parsed.data).returning();
  res.status(201).json(formatCarrier(carrier));
});

router.get("/carriers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [carrier] = await db.select().from(carriersTable).where(eq(carriersTable.id, id)).limit(1);
  if (!carrier) { res.status(404).json({ error: "運送会社が見つかりません" }); return; }
  res.json(formatCarrier(carrier));
});

router.patch("/carriers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const parsed = UpdateCarrierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [carrier] = await db.update(carriersTable).set(parsed.data).where(eq(carriersTable.id, id)).returning();
  if (!carrier) { res.status(404).json({ error: "運送会社が見つかりません" }); return; }
  res.json(formatCarrier(carrier));
});

router.delete("/carriers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }
  await db.delete(carriersTable).where(eq(carriersTable.id, id));
  res.json({ success: true });
});

export default router;
