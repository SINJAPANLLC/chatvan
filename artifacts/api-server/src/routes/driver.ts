/**
 * /api/driver/:token  — 認証不要のドライバー/運送会社向けAPI
 */
import { Router, type IRouter } from "express";
import { db, shipmentsTable, carriersTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { notifyAdmins } from "../lib/notifyHelpers";
import { sendAutoNotification, notifyShipmentStatusToAdmins } from "../lib/autoNotify";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatShipment(s: any, carrier?: any) {
  return {
    id: s.id,
    token: s.driverToken,
    status: s.status,
    pickupAddress: s.pickupAddress,
    pickupDatetime: s.pickupDatetime,
    deliveryAddress: s.deliveryAddress,
    deliveryDeadline: s.deliveryDeadline,
    cargoType: s.cargoType,
    cargoQuantity: s.cargoQuantity,
    cargoWeight: s.cargoWeight,
    cargoSize: s.cargoSize,
    vehicleType: s.vehicleType,
    vehicleSize: (s as any).vehicleSize,
    vehicleBodyType: (s as any).vehicleBodyType,
    deliveryType: (s as any).deliveryType,
    additionalWork: (s as any).additionalWork,
    highwayUse: (s as any).highwayUse,
    notes: s.notes,
    assignedDriverName: s.assignedDriverName,
    driverCarrierName: (s as any).driverCarrierName,
    driverPhone: (s as any).driverPhone,
    driverVehicleNumber: (s as any).driverVehicleNumber,
    driverLat: (s as any).driverLat ? Number((s as any).driverLat) : null,
    driverLng: (s as any).driverLng ? Number((s as any).driverLng) : null,
    driverLocationUpdatedAt: (s as any).driverLocationUpdatedAt instanceof Date
      ? (s as any).driverLocationUpdatedAt.toISOString()
      : (s as any).driverLocationUpdatedAt,
    carrier: carrier ? { companyName: carrier.companyName, phone: carrier.phone } : null,
  };
}

async function findByToken(token: string) {
  const [shipment] = await db
    .select()
    .from(shipmentsTable)
    .where(eq((shipmentsTable as any).driverToken, token))
    .limit(1);
  return shipment ?? null;
}

// GET /api/driver/:token — 指示書 + ドライバー情報取得
router.get("/driver/:token", async (req, res): Promise<void> => {
  const shipment = await findByToken(req.params.token);
  if (!shipment) { res.status(404).json({ error: "指示書が見つかりません" }); return; }

  const carrier = (shipment as any).assignedCarrierId
    ? (await db.select().from(carriersTable).where(eq(carriersTable.id, (shipment as any).assignedCarrierId)).limit(1))[0]
    : null;

  res.json(formatShipment(shipment, carrier));
});

// POST /api/driver/generate/:shipmentId — トークン生成（管理者側から呼ぶ）
router.post("/driver/generate/:shipmentId", async (req, res): Promise<void> => {
  const id = parseInt(req.params.shipmentId, 10);
  const [existing] = await db.select({ token: (shipmentsTable as any).driverToken }).from(shipmentsTable).where(eq(shipmentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "案件が見つかりません" }); return; }

  // すでにトークンがあればそれを返す
  if ((existing as any).token) { res.json({ token: (existing as any).token }); return; }

  const token = randomUUID();
  await db.update(shipmentsTable).set({ driverToken: token } as any).where(eq(shipmentsTable.id, id));
  res.json({ token });
});

// PATCH /api/driver/:token/info — ドライバー情報更新
router.patch("/driver/:token/info", async (req, res): Promise<void> => {
  const shipment = await findByToken(req.params.token);
  if (!shipment) { res.status(404).json({ error: "指示書が見つかりません" }); return; }

  const { driverName, driverCarrierName, driverPhone, driverVehicleNumber } = req.body;
  const updates: any = {};
  if (driverName !== undefined) updates.assignedDriverName = driverName;
  if (driverCarrierName !== undefined) updates.driverCarrierName = driverCarrierName;
  if (driverPhone !== undefined) updates.driverPhone = driverPhone;
  if (driverVehicleNumber !== undefined) updates.driverVehicleNumber = driverVehicleNumber;

  if (Object.keys(updates).length > 0) {
    await db.update(shipmentsTable).set(updates).where(eq(shipmentsTable.id, shipment.id));
  }
  res.json({ ok: true });
});

// PATCH /api/driver/:token/status — ステータス変更
const ALLOWED = ['集荷完了', '配送中', '納品完了'];
router.patch("/driver/:token/status", async (req, res): Promise<void> => {
  const shipment = await findByToken(req.params.token);
  if (!shipment) { res.status(404).json({ error: "指示書が見つかりません" }); return; }

  const { status } = req.body;
  if (!ALLOWED.includes(status)) { res.status(400).json({ error: "無効なステータス" }); return; }

  const [updatedShipment] = await db.update(shipmentsTable)
    .set({ status } as any)
    .where(and(eq(shipmentsTable.id, shipment.id), ne(shipmentsTable.status, status as any)))
    .returning();
  if (!updatedShipment) {
    res.json({ ok: true, unchanged: true });
    return;
  }
  if (shipment.userId != null) {
    const route = shipment.pickupAddress && shipment.deliveryAddress
      ? `${shipment.pickupAddress} → ${shipment.deliveryAddress}`
      : undefined;
    sendAutoNotification({ shipmentId: updatedShipment.id, userId: shipment.userId, status, route }).catch((error) =>
      logger.error({ err: error, shipmentId: updatedShipment.id, status }, "[DRIVER STATUS NOTIFICATION ERROR]")
    );
  } else {
    const route = shipment.pickupAddress && shipment.deliveryAddress
      ? `${shipment.pickupAddress} → ${shipment.deliveryAddress}`
      : undefined;
    notifyShipmentStatusToAdmins({ shipmentId: updatedShipment.id, status, route }).catch((error) =>
      logger.error({ err: error, shipmentId: updatedShipment.id, status }, "[DRIVER STATUS NOTIFICATION ERROR]")
    );
  }
  res.json({ ok: true });
});

// POST /api/driver/:token/location — GPS位置更新
router.post("/driver/:token/location", async (req, res): Promise<void> => {
  const shipment = await findByToken(req.params.token);
  if (!shipment) { res.status(404).json({ error: "指示書が見つかりません" }); return; }

  const { lat, lng } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat/lng が必要です" }); return;
  }

  await db.update(shipmentsTable).set({
    driverLat: String(lat),
    driverLng: String(lng),
    driverLocationUpdatedAt: new Date(),
  } as any).where(eq(shipmentsTable.id, shipment.id));

  res.json({ ok: true });
});

// ── マスターカード（運送会社登録票） ──────────────────────────────────────────

// GET /api/master-card/:token — フォーム表示用（トークンで案件を特定）
router.get("/master-card/:token", async (req, res): Promise<void> => {
  const shipment = await findByToken(req.params.token);
  if (!shipment) { res.status(404).json({ error: "リンクが無効です" }); return; }
  const carrier = (shipment as any).assignedCarrierId
    ? (await db.select().from(carriersTable).where(eq(carriersTable.id, (shipment as any).assignedCarrierId)).limit(1))[0]
    : null;
  // master_card_data を raw SQL で取得
  const rows = await db.execute(sql`SELECT master_card_data FROM shipments WHERE id = ${shipment.id}`);
  const mcRaw = (rows.rows?.[0] as any)?.master_card_data ?? null;
  res.json({
    shipmentId: shipment.id,
    carrierName: carrier?.companyName ?? (shipment as any).driverCarrierName ?? null,
    masterCardData: mcRaw ? JSON.parse(mcRaw) : null,
  });
});

// GET /api/shipments/:id/master-card-data — 管理画面用：提出済みマスターカード取得
router.get("/shipments/:id/master-card-data", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }
  const rows = await db.execute(sql`SELECT master_card_data FROM shipments WHERE id = ${id}`);
  const mcRaw = (rows.rows?.[0] as any)?.master_card_data ?? null;
  res.json({ masterCardData: mcRaw ? JSON.parse(mcRaw) : null });
});

// POST /api/master-card/:token/submit — フォーム送信
router.post("/master-card/:token/submit", async (req, res): Promise<void> => {
  const shipment = await findByToken(req.params.token);
  if (!shipment) { res.status(404).json({ error: "リンクが無効です" }); return; }

  const d = req.body as Record<string, string>;

  // DBに保存（raw SQL — スキーマ外カラム）
  await db.execute(
    sql`UPDATE shipments SET master_card_data = ${JSON.stringify({ ...d, submittedAt: new Date().toISOString() })} WHERE id = ${shipment.id}`
  );

  // 管理者へメール通知
  const rows = [
    ["NO", d.no],
    ["会社名（フリガナ）", d.companyKana],
    ["会社名", d.companyName],
    ["支店名（フリガナ）", d.branchKana],
    ["支店名", d.branchName],
    ["所在地", d.address],
    ["TEL", d.tel],
    ["FAX", d.fax],
    ["配車担当", d.dispatchContact],
    ["経理担当", d.accountingContact],
    ["本社代表者", d.representative],
    ["締め日", d.closingDate],
    ["支払日サイト", d.paymentSite],
    ["振込先銀行", d.bankName],
    ["預金種別", d.accountType],
    ["口座名義", d.accountHolder],
    ["計上日", d.postingDate],
    ["積日", d.loadDate],
    ["卸日", d.unloadDate],
    ["相殺", d.offset],
    ["適格請求書発行", d.qualifiedInvoice],
    ["事業者登録番号", d.registrationNumber],
    ["受領書送付先", d.receiptAddress],
    ["加入保険会社", d.insuranceCompany],
    ["保有車両", d.vehicles],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}：${v}`)
    .join("\n");

  await notifyAdmins(
    "Chat LOGI - マスターカード登録",
    `運送会社からマスターカードが提出されました。\n\n案件 #${shipment.id}\n${rows}`,
  );

  // 運送会社テーブルに情報を反映（アサイン済みの場合のみ）
  if ((shipment as any).assignedCarrierId && d.companyName) {
    const updates: any = {};
    if (d.tel) updates.phone = d.tel;
    if (d.fax) updates.fax = d.fax;
    if (d.address) updates.serviceAreas = d.address;
    if (d.vehicles) updates.vehicleTypes = d.vehicles;
    if (d.bankName || d.accountType || d.accountHolder) {
      updates.bankAccount = [d.bankName, d.accountType, d.accountHolder].filter(Boolean).join(" / ");
    }
    if (d.paymentSite) updates.paymentTerms = d.paymentSite;
    if (Object.keys(updates).length > 0) {
      await db.update(carriersTable).set(updates).where(eq(carriersTable.id, (shipment as any).assignedCarrierId));
    }
  }

  res.json({ ok: true });
});

export default router;
