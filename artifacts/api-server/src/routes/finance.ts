import { Router, type IRouter } from "express";
import { db, shipmentsTable, paymentsTable, invoicesTable, usersTable, carriersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const CONFIRMED = ['配車確定', '集荷完了', '配送中', '納品完了', '請求完了'];
const confirmedSql = CONFIRMED.map(s => `'${s}'`).join(',');
const inConfirmed = `status = ANY(ARRAY[${confirmedSql}]::shipment_status[])`;

// GET /admin/finance/pl?year=2026
router.get("/admin/finance/pl", requireAdmin, async (req, res): Promise<void> => {
  const year = Number(req.query.year ?? new Date().getFullYear());

  const rows = await db.select({
    month: sql<string>`TO_CHAR(created_at, 'YYYY-MM')`,
    revenue: sql<string>`SUM(CASE WHEN ${sql.raw(inConfirmed)} THEN COALESCE(customer_price::numeric,0) ELSE 0 END)`,
    cost:    sql<string>`SUM(CASE WHEN ${sql.raw(inConfirmed)} THEN COALESCE(carrier_cost::numeric,0) ELSE 0 END)`,
    cardRevenue:    sql<string>`SUM(CASE WHEN ${sql.raw(inConfirmed)} AND payment_method='card'    THEN COALESCE(customer_price::numeric,0) ELSE 0 END)`,
    invoiceRevenue: sql<string>`SUM(CASE WHEN ${sql.raw(inConfirmed)} AND payment_method='invoice' THEN COALESCE(customer_price::numeric,0) ELSE 0 END)`,
    totalShipments:     sql<string>`COUNT(*)`,
    confirmedShipments: sql<string>`COUNT(CASE WHEN ${sql.raw(inConfirmed)} THEN 1 END)`,
  }).from(shipmentsTable)
    .where(sql`EXTRACT(YEAR FROM created_at) = ${year}`)
    .groupBy(sql`TO_CHAR(created_at, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(created_at, 'YYYY-MM')`);

  res.json(rows.map(r => {
    const revenue = Number(r.revenue ?? 0);
    const cost    = Number(r.cost ?? 0);
    return {
      month: r.month,
      revenue,
      cost,
      grossProfit: revenue - cost,
      profitRate: revenue > 0 ? Math.round((revenue - cost) / revenue * 1000) / 10 : 0,
      cardRevenue:    Number(r.cardRevenue ?? 0),
      invoiceRevenue: Number(r.invoiceRevenue ?? 0),
      totalShipments:     Number(r.totalShipments ?? 0),
      confirmedShipments: Number(r.confirmedShipments ?? 0),
    };
  }));
});

// GET /admin/finance/pl/shipments?year=2026&month=07 — 月別案件明細
router.get("/admin/finance/pl/shipments", requireAdmin, async (req, res): Promise<void> => {
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = String(req.query.month ?? '').padStart(2, '0');
  const ym    = `${year}-${month}`;

  const rows = await db.select({
    id:              shipmentsTable.id,
    pickupAddress:   shipmentsTable.pickupAddress,
    deliveryAddress: shipmentsTable.deliveryAddress,
    status:          shipmentsTable.status,
    customerPrice:   shipmentsTable.customerPrice,
    carrierCost:     shipmentsTable.carrierCost,
    paymentMethod:   shipmentsTable.paymentMethod,
    createdAt:       shipmentsTable.createdAt,
    // 顧客
    userName:        usersTable.name,
    companyName:     usersTable.companyName,
    // 運送会社（自由入力 or マスタJOIN）
    driverCarrierName: (shipmentsTable as any).driverCarrierName,
    carrierName:     carriersTable.companyName,
  }).from(shipmentsTable)
    .leftJoin(usersTable,    eq(shipmentsTable.userId, usersTable.id))
    .leftJoin(carriersTable, eq(shipmentsTable.assignedCarrierId, carriersTable.id))
    .where(and(
      sql`${shipmentsTable.status} = ANY(ARRAY[${sql.raw(confirmedSql)}]::shipment_status[])`,
      sql`TO_CHAR(${shipmentsTable.createdAt}, 'YYYY-MM') = ${ym}`,
    ))
    .orderBy(sql`${shipmentsTable.createdAt} DESC`);

  res.json(rows.map(r => ({
    ...r,
    carrierName:   (r as any).driverCarrierName || r.carrierName,
    customerPrice: Number(r.customerPrice ?? 0),
    carrierCost:   Number(r.carrierCost ?? 0),
    grossProfit:   Number(r.customerPrice ?? 0) - Number(r.carrierCost ?? 0),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  })));
});

// GET /admin/finance/invoices — 消し込み用請求書一覧（draft/sent/overdue）
router.get("/admin/finance/invoices", requireAdmin, async (_req, res): Promise<void> => {
  const list = await db.select({
    id:            invoicesTable.id,
    invoiceNumber: invoicesTable.invoiceNumber,
    status:        invoicesTable.status,
    subtotal:      invoicesTable.subtotal,
    tax:           invoicesTable.tax,
    totalAmount:   invoicesTable.totalAmount,
    periodStart:   invoicesTable.periodStart,
    periodEnd:     invoicesTable.periodEnd,
    dueDate:       invoicesTable.dueDate,
    paidAt:        invoicesTable.paidAt,
    createdAt:     invoicesTable.createdAt,
    userName:      usersTable.name,
    companyName:   usersTable.companyName,
  }).from(invoicesTable)
    .leftJoin(usersTable, eq(invoicesTable.userId, usersTable.id))
    .orderBy(sql`${invoicesTable.createdAt} DESC`);

  res.json(list.map(r => ({
    ...r,
    subtotal:    Number(r.subtotal),
    tax:         Number(r.tax),
    totalAmount: Number(r.totalAmount),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    paidAt:    r.paidAt    instanceof Date ? r.paidAt.toISOString()    : r.paidAt,
  })));
});

// GET /admin/finance/card-payments — カード決済一覧（shipmentsからcard案件を取得）
router.get("/admin/finance/card-payments", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id:              shipmentsTable.id,
    shipmentId:      shipmentsTable.id,
    totalAmount:     shipmentsTable.customerPrice,
    paymentMethod:   shipmentsTable.paymentMethod,
    paymentStatus:   shipmentsTable.paymentStatus,
    squareCaptured:  shipmentsTable.squareCaptured,
    pickupAddress:   shipmentsTable.pickupAddress,
    deliveryAddress: shipmentsTable.deliveryAddress,
    updatedAt:       shipmentsTable.updatedAt,
    userName:        usersTable.name,
    companyName:     usersTable.companyName,
  }).from(shipmentsTable)
    .leftJoin(usersTable, eq(shipmentsTable.userId, usersTable.id))
    .where(eq(shipmentsTable.paymentMethod, "card"))
    .orderBy(sql`${shipmentsTable.updatedAt} DESC`);

  res.json(rows.map(r => ({
    ...r,
    totalAmount: Number(r.totalAmount ?? 0),
    paidAt: r.squareCaptured === 'true' && r.updatedAt
      ? (r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt)
      : null,
  })));
});

// PATCH /admin/finance/card-payments/:id/reconcile — shipmentのステータスを入金確認済みに
router.patch("/admin/finance/card-payments/:id/reconcile", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.update(shipmentsTable).set({ paymentStatus: "入金確認済み", updatedAt: new Date() }).where(eq(shipmentsTable.id, id));
  res.json({ ok: true });
});

export default router;
