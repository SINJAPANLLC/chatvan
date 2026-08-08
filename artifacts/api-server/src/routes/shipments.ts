import { Router, type IRouter } from "express";
import { db, shipmentsTable, usersTable, carriersTable } from "@workspace/db";
import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";
// Zod schemas removed in Chat VAN migration — using req.body directly
type CreateShipmentBody = any;
type UpdateShipmentBody = any;
type UpdateShipmentStatusBody = any;
type ListShipmentsQueryParams = any;
type GetShipmentParams = any;
type UpdateShipmentParams = any;
type UpdateShipmentStatusParams = any;
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { authorizeOnFile } from "../lib/square-authorize";
import { sendAutoNotification } from "../lib/autoNotify";
import { sendEmail, buildEmailHtml, ADMIN_NOTIFY_EMAIL } from "../lib/email";
import { calcPriceWithConfig, parsePricingConfig, DEFAULT_CONFIG } from "../lib/pricing";
import { settingsTable } from "@workspace/db";
import { like } from "drizzle-orm";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(s, 10);
}

function formatShipment(s: any, user?: any, carrier?: any) {
  return {
    ...s,
    customerPrice: s.customerPrice ? Number(s.customerPrice) : null,
    carrierCost: s.carrierCost ? Number(s.carrierCost) : null,
    grossProfit: s.grossProfit ? Number(s.grossProfit) : null,
    desiredPrice: s.desiredPrice ? Number(s.desiredPrice) : null,
    truckCount: s.truckCount ? Number(s.truckCount) : null,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
    user: user ? { ...user, createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt } : null,
    carrier: carrier ? { ...carrier, averageCost: carrier.averageCost ? Number(carrier.averageCost) : null, onTimeRate: carrier.onTimeRate ? Number(carrier.onTimeRate) : null, rating: carrier.rating ? Number(carrier.rating) : null, createdAt: carrier.createdAt instanceof Date ? carrier.createdAt.toISOString() : carrier.createdAt } : null,
  };
}

router.get("/shipments", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListShipmentsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  const isAdmin = req.session.userRole === "admin";
  const conditions: any[] = [];

  // Non-admins can only see their own shipments
  if (!isAdmin) {
    conditions.push(eq(shipmentsTable.userId, req.session.userId));
  } else if (params.userId) {
    conditions.push(eq(shipmentsTable.userId, Number(params.userId)));
  }

  if (params.status) {
    conditions.push(eq(shipmentsTable.status, params.status as any));
  }
  if (params.carrierId) {
    conditions.push(eq(shipmentsTable.assignedCarrierId, Number(params.carrierId)));
  }
  if (params.dateFrom) {
    conditions.push(gte(shipmentsTable.createdAt, new Date(params.dateFrom)));
  }
  if (params.dateTo) {
    conditions.push(lte(shipmentsTable.createdAt, new Date(params.dateTo)));
  }

  const page = params.page ? Number(params.page) : 1;
  const limit = params.limit ? Number(params.limit) : 20;
  const offset = (page - 1) * limit;

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(shipmentsTable)
    .where(whereClause)
    .orderBy(desc(shipmentsTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch related users and carriers
  const userIds = [...new Set(items.map(i => i.userId).filter(Boolean))] as number[];
  const carrierIds = [...new Set(items.map(i => i.assignedCarrierId).filter(Boolean))] as number[];

  const users = userIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const carriers = carrierIds.length > 0
    ? await db.select().from(carriersTable).where(inArray(carriersTable.id, carrierIds))
    : [];

  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const carrierMap = Object.fromEntries(carriers.map(c => [c.id, c]));

  const [{ count }] = await db
    .select({ count: db.$count(shipmentsTable, whereClause) })
    .from(shipmentsTable);

  const formatted = items.map(s =>
    formatShipment(s, s.userId ? userMap[s.userId] : null, s.assignedCarrierId ? carrierMap[s.assignedCarrierId] : null)
  );

  res.json({ items: formatted, total: Number(count) });
});

router.post("/shipments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateShipmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [shipment] = await db
    .insert(shipmentsTable)
    .values({ ...parsed.data, userId: req.session.userId, status: "受付中" })
    .returning();

  // 管理者への新規配送依頼通知（非同期）
  const [user] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
  const adminSubject = `【Chat LOGI】新規配送依頼 #${shipment.id}`;
  const adminBody = [
    `新しい配送依頼が届きました。`,
    ``,
    `依頼者：${user?.name ?? "不明"}（${user?.email ?? ""}）`,
    `案件ID：#${shipment.id}`,
    `集荷先：${shipment.pickupAddress ?? "未設定"}`,
    `納品先：${shipment.deliveryAddress ?? "未設定"}`,
    `車格：${shipment.vehicleSize ?? "未設定"}`,
  ].join("\n");
  sendEmail(
    ADMIN_NOTIFY_EMAIL,
    adminSubject,
    buildEmailHtml({ subject: adminSubject, body: adminBody, ctaText: "管理画面で確認する →" }),
  ).catch(() => {});

  res.status(201).json(formatShipment(shipment));
});

router.get("/shipments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [shipment] = await db
    .select()
    .from(shipmentsTable)
    .where(eq(shipmentsTable.id, id))
    .limit(1);

  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  const isAdmin = req.session.userRole === "admin";
  if (!isAdmin && shipment.userId !== req.session.userId) {
    res.status(403).json({ error: "アクセス権限がありません" }); return;
  }

  const user = shipment.userId
    ? (await db.select().from(usersTable).where(eq(usersTable.id, shipment.userId)).limit(1))[0]
    : null;
  const carrier = shipment.assignedCarrierId
    ? (await db.select().from(carriersTable).where(eq(carriersTable.id, shipment.assignedCarrierId)).limit(1))[0]
    : null;

  res.json(formatShipment(shipment, user, carrier));
});

router.patch("/shipments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const parsed = UpdateShipmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: any = { ...parsed.data, updatedAt: new Date() };

  // 車格・ルート変更時は料金を自動再計算
  const PRICING_FIELDS = ['vehicleSize','vehicleBodyType','truckCount','pickupAddress','deliveryAddress','deliveryType','additionalWork','highwayUse'];
  const hasPricingChange = PRICING_FIELDS.some(f => f in updates);
  if (hasPricingChange && updates.customerPrice == null) {
    // 現在のDBレコードを取得してアドレス等を補完
    const [cur] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id));
    if (cur) {
      const hw = (updates.highwayUse ?? cur.highwayUse) === 'あり' || (updates.highwayUse ?? cur.highwayUse) === true;
      let pricingCfg = DEFAULT_CONFIG;
      try {
        const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "pricing_%"));
        if (rows.length > 0) pricingCfg = parsePricingConfig(rows);
      } catch { /* デフォルト */ }

      const pricing = calcPriceWithConfig({
        vehicleSize:     updates.vehicleSize     ?? cur.vehicleSize     ?? '2t',
        vehicleBodyType: updates.vehicleBodyType ?? cur.vehicleBodyType ?? '平ボディ',
        truckCount:      Number(updates.truckCount ?? cur.truckCount)   || 1,
        pickupAddress:   updates.pickupAddress   ?? cur.pickupAddress   ?? '',
        deliveryAddress: updates.deliveryAddress ?? cur.deliveryAddress ?? '',
        deliveryType:    updates.deliveryType    ?? cur.deliveryType,
        additionalWork:  updates.additionalWork  ?? cur.additionalWork,
        highwayUse: hw,
        isUrgent: false,
      }, pricingCfg);

      updates.customerPrice = pricing.customerPrice.toString();
      updates.carrierCost   = pricing.carrierCost.toString();
      updates.grossProfit   = pricing.grossProfit.toString();
    }
  }

  // 請求額・原価のどちらか一方でも変更された場合は粗利を再計算
  if ((updates.customerPrice != null || updates.carrierCost != null) && !hasPricingChange) {
    const [cur] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id));
    if (cur) {
      const cp = Number(updates.customerPrice ?? cur.customerPrice ?? 0);
      const cc = Number(updates.carrierCost  ?? cur.carrierCost  ?? 0);
      updates.grossProfit = (cp - cc).toString();
    }
  }

  const [shipment] = await db
    .update(shipmentsTable)
    .set(updates)
    .where(eq(shipmentsTable.id, id))
    .returning();

  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  res.json(formatShipment(shipment));
});

router.patch("/shipments/:id/status", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const parsed = UpdateShipmentStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [shipment] = await db
    .update(shipmentsTable)
    .set({ status: parsed.data.status as any, updatedAt: new Date() })
    .where(eq(shipmentsTable.id, id))
    .returning();

  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  // 配車確定になったら登録済みカードで自動オーソリ
  if (parsed.data.status === '配車確定' && !shipment.squarePaymentId) {
    authorizeOnFile(id).catch(() => {});
  }

  // 自動通知（非同期・失敗しても案件更新は成功扱い）
  const route = shipment.pickupAddress && shipment.deliveryAddress
    ? `${shipment.pickupAddress} → ${shipment.deliveryAddress}`
    : undefined;
  sendAutoNotification({ shipmentId: id, userId: shipment.userId, status: parsed.data.status, route }).catch(() => {});

  res.json(formatShipment(shipment));
});

// POST /shipments/:id/cancel-request — 顧客がキャンセル申請
const IMMEDIATE_CANCEL = ['受付中', 'ヒアリング中', '見積提示'];
const NO_CANCEL = ['請求完了', 'キャンセル', 'キャンセル申請中'];

router.post("/shipments/:id/cancel-request", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [current] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "案件が見つかりません" }); return; }
  if (current.userId !== req.session.userId) { res.status(403).json({ error: "権限がありません" }); return; }
  if (NO_CANCEL.includes(current.status)) { res.status(400).json({ error: "このステータスではキャンセルできません" }); return; }

  const newStatus = IMMEDIATE_CANCEL.includes(current.status) ? 'キャンセル' : 'キャンセル申請中';
  const [shipment] = await db
    .update(shipmentsTable)
    .set({
      status: newStatus as any,
      cancelPreviousStatus: newStatus === 'キャンセル申請中' ? current.status : null,
      updatedAt: new Date(),
    })
    .where(eq(shipmentsTable.id, id))
    .returning();

  res.json(formatShipment(shipment));
});

// PATCH /shipments/:id/cancel-approve — 管理者がキャンセル承認
router.patch("/shipments/:id/cancel-approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [shipment] = await db
    .update(shipmentsTable)
    .set({ status: 'キャンセル' as any, cancelPreviousStatus: null, updatedAt: new Date() })
    .where(eq(shipmentsTable.id, id))
    .returning();

  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  sendAutoNotification({ shipmentId: id, userId: shipment.userId, status: "キャンセル" }).catch(() => {});

  res.json(formatShipment(shipment));
});

// PATCH /shipments/:id/cancel-reject — 管理者がキャンセル却下（元のステータスに戻す）
router.patch("/shipments/:id/cancel-reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [current] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  const revertTo = (current.cancelPreviousStatus || '手配中') as any;
  const [shipment] = await db
    .update(shipmentsTable)
    .set({ status: revertTo, cancelPreviousStatus: null, updatedAt: new Date() })
    .where(eq(shipmentsTable.id, id))
    .returning();

  res.json(formatShipment(shipment));
});

// GET /api/shipments/:id/stops — 複数地点取得
router.get("/shipments/:id/stops", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }
  const rows = await db.execute(sql`SELECT stops_json FROM shipments WHERE id = ${id}`);
  const raw = (rows.rows?.[0] as any)?.stops_json ?? null;
  res.json({ stops: raw ? JSON.parse(raw) : [] });
});

// PATCH /api/shipments/:id/stops — 複数地点保存
router.patch("/shipments/:id/stops", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }
  const { stops } = req.body;
  await db.execute(sql`UPDATE shipments SET stops_json = ${JSON.stringify(stops)}, updated_at = NOW() WHERE id = ${id}`);
  res.json({ ok: true });
});

export default router;
