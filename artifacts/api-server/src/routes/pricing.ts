import { Router, type IRouter } from "express";
import { db, pricingRulesTable, settingsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
// Zod schemas removed in Chat VAN migration
type CreatePricingRuleBody = any;
type UpdatePricingRuleBody = any;
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { parsePricingConfig, serializePricingConfig, DEFAULT_CONFIG, calcPriceWithConfig } from "../lib/pricing";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatRule(r: any) {
  return {
    ...r,
    value: Number(r.value),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

router.get("/pricing-rules", requireAuth, async (_req, res): Promise<void> => {
  const rules = await db.select().from(pricingRulesTable).orderBy(pricingRulesTable.id);
  res.json(rules.map(formatRule));
});

router.post("/pricing-rules", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePricingRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [rule] = await db.insert(pricingRulesTable).values({
    ...parsed.data,
    value: parsed.data.value.toString(),
  }).returning();
  res.status(201).json(formatRule(rule));
});

router.patch("/pricing-rules/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const parsed = UpdatePricingRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: any = { ...parsed.data };
  if (updateData.value !== undefined) updateData.value = updateData.value.toString();

  const [rule] = await db.update(pricingRulesTable).set(updateData).where(eq(pricingRulesTable.id, id)).returning();
  if (!rule) { res.status(404).json({ error: "料金ルールが見つかりません" }); return; }
  res.json(formatRule(rule));
});

router.delete("/pricing-rules/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }
  await db.delete(pricingRulesTable).where(eq(pricingRulesTable.id, id));
  res.json({ success: true });
});

// POST /api/pricing/estimate — 保存せずに料金計算（プレビュー用）
router.post("/pricing/estimate", requireAuth, async (req, res): Promise<void> => {
  const { vehicleSize, vehicleBodyType, truckCount, pickupAddress, deliveryAddress,
          deliveryType, additionalWork, highwayUse, isUrgent } = req.body;

  let pricingCfg = DEFAULT_CONFIG;
  try {
    const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "pricing_%"));
    if (rows.length > 0) pricingCfg = parsePricingConfig(rows);
  } catch { /* デフォルト使用 */ }

  const hw = highwayUse === true || highwayUse === 'true' || highwayUse === 'あり';
  const pricing = calcPriceWithConfig({
    vehicleSize:     vehicleSize     ?? '2t',
    vehicleBodyType: vehicleBodyType ?? '平ボディ',
    truckCount:      Number(truckCount) || 1,
    pickupAddress,
    deliveryAddress,
    deliveryType,
    additionalWork,
    highwayUse: hw,
    isUrgent:   isUrgent ?? false,
  }, pricingCfg);

  res.json(pricing);
});

// ── 料金設定 (settings テーブル経由) ─────────────────────────────────────────
// GET /admin/pricing-config — 現在の料金設定を返す
router.get("/admin/pricing-config", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "pricing_%"));
  const cfg = rows.length > 0 ? parsePricingConfig(rows) : DEFAULT_CONFIG;
  res.json(cfg);
});

// POST /admin/pricing-config — 料金設定を保存
router.post("/admin/pricing-config", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body;
  const cfg = {
    margin:     typeof body.margin === 'number' ? body.margin : DEFAULT_CONFIG.margin,
    minPrice:   typeof body.minPrice === 'number' ? body.minPrice : DEFAULT_CONFIG.minPrice,
    basePrice:  body.basePrice ?? DEFAULT_CONFIG.basePrice,
    bodyRate:   body.bodyRate ?? DEFAULT_CONFIG.bodyRate,
    workFee:    body.workFee ?? DEFAULT_CONFIG.workFee,
    highwayFee: body.highwayFee ?? DEFAULT_CONFIG.highwayFee,
  };
  const kvs = serializePricingConfig(cfg as any);
  for (const [key, value] of Object.entries(kvs)) {
    await db.insert(settingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
  }
  res.json(cfg);
});

export default router;
