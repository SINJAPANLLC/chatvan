import { Router, type IRouter } from "express";
import { db, invoicesTable, invoiceItemsTable, shipmentsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function fmt(inv: any) {
  return {
    ...inv,
    subtotal: Number(inv.subtotal),
    tax: Number(inv.tax),
    totalAmount: Number(inv.totalAmount),
    createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt,
    paidAt: inv.paidAt instanceof Date ? inv.paidAt.toISOString() : inv.paidAt,
  };
}

// GET /invoices — 自分の請求書一覧
router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const list = await db.select().from(invoicesTable)
    .where(eq(invoicesTable.userId, req.session.userId!))
    .orderBy(sql`${invoicesTable.createdAt} DESC`);
  res.json(list.map(fmt));
});

// GET /invoices/:id — 請求書詳細（明細付き）
router.get("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "請求書が見つかりません" }); return; }
  if (invoice.userId !== req.session.userId && req.session.userRole !== "admin") {
    res.status(403).json({ error: "権限がありません" }); return;
  }

  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
  // 過去に作成されたChat VAN請求書には明細レコードがないものがあるため、
  // PDF/印刷用の表示では請求書本体の金額から安全に明細を補う。
  const displayItems = items.length > 0
    ? items.map(i => ({ ...i, amount: Number(i.amount) }))
    : invoice.contractId
      ? [{
          id: `van-invoice-${invoice.id}`,
          description: invoice.invoiceNumber.includes("-ADD-")
            ? "追加請求"
            : `車両利用料（${invoice.periodStart}〜${invoice.periodEnd}）`,
          amount: Number(invoice.subtotal),
        }]
      : [];
  res.json({ ...fmt(invoice), items: displayItems });
});

// ── 管理者エンドポイント ──────────────────────────────────────────────────────

// GET /admin/invoices — 全請求書一覧
router.get("/admin/invoices", requireAdmin, async (_req, res): Promise<void> => {
  const list = await db.select({
    invoice: invoicesTable,
    userName: usersTable.name,
    companyName: usersTable.companyName,
  }).from(invoicesTable)
    .leftJoin(usersTable, eq(invoicesTable.userId, usersTable.id))
    .orderBy(sql`${invoicesTable.createdAt} DESC`);

  res.json(list.map(r => ({ ...fmt(r.invoice), userName: r.userName, companyName: r.companyName })));
});

// POST /admin/invoices/generate — 月次請求書生成
// body: { year: 2026, month: 7 }
router.post("/admin/invoices/generate", requireAdmin, async (req, res): Promise<void> => {
  const { year, month } = req.body;
  if (!year || !month) { res.status(400).json({ error: "year と month を指定してください" }); return; }

  const y = Number(year);
  const m = Number(month);
  const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const periodEnd = `${y}-${String(m).padStart(2, "0")}-${lastDay}`;

  // Net30 due date
  const due = new Date(y, m, lastDay + 30); // 翌月末 + 30日
  const dueDate = due.toISOString().slice(0, 10);

  // 対象案件：請求書払い・納品完了・未請求
  const shipments = await db.select({
    id: shipmentsTable.id,
    userId: shipmentsTable.userId,
    customerPrice: shipmentsTable.customerPrice,
    pickupAddress: shipmentsTable.pickupAddress,
    deliveryAddress: shipmentsTable.deliveryAddress,
    pickupDatetime: shipmentsTable.pickupDatetime,
  }).from(shipmentsTable).where(
    and(
      eq(shipmentsTable.paymentMethod, "invoice"),
      eq(shipmentsTable.status, "納品完了"),
      gte(shipmentsTable.pickupDatetime, periodStart),
      lte(shipmentsTable.pickupDatetime, periodEnd),
    )
  );

  if (shipments.length === 0) {
    res.json({ message: "対象案件なし", invoices: [] });
    return;
  }

  // ユーザーごとにグループ化
  const grouped = new Map<number, typeof shipments>();
  for (const s of shipments) {
    if (!s.userId) continue;
    if (!grouped.has(s.userId)) grouped.set(s.userId, []);
    grouped.get(s.userId)!.push(s);
  }

  const created = [];
  for (const [userId, items] of grouped.entries()) {
    const subtotal = items.reduce((sum, s) => sum + Number(s.customerPrice ?? 0), 0);
    const tax = Math.round(subtotal * 0.1);
    const totalAmount = subtotal + tax;
    const invoiceNumber = `INV-${y}${String(m).padStart(2, "0")}-${userId}`;

    // 既存チェック
    const existing = await db.select().from(invoicesTable)
      .where(eq(invoicesTable.invoiceNumber, invoiceNumber)).limit(1);
    if (existing.length > 0) continue;

    const [invoice] = await db.insert(invoicesTable).values({
      userId,
      invoiceNumber,
      periodStart,
      periodEnd,
      subtotal: subtotal.toString(),
      tax: tax.toString(),
      totalAmount: totalAmount.toString(),
      dueDate,
      status: "draft",
    }).returning();

    await db.insert(invoiceItemsTable).values(
      items.map(s => ({
        invoiceId: invoice.id,
        shipmentId: s.id,
        description: `${s.pickupDatetime?.slice(0, 10) ?? ""} ${s.pickupAddress ?? ""} → ${s.deliveryAddress ?? ""}`,
        amount: Number(s.customerPrice ?? 0).toString(),
      }))
    );

    // 案件の paymentStatus を更新
    for (const s of items) {
      await db.update(shipmentsTable).set({
        paymentStatus: "請求書発行済み",
        status: "請求完了",
        updatedAt: new Date(),
      }).where(eq(shipmentsTable.id, s.id));
    }

    // creditUsed を加算
    await db.update(usersTable).set({
      creditUsed: sql`credit_used + ${totalAmount}`,
    }).where(eq(usersTable.id, userId));

    created.push(fmt(invoice));
  }

  res.json({ message: `${created.length}件の請求書を生成しました`, invoices: created });
});

// PATCH /admin/invoices/:id/send — 送付済みに更新
router.patch("/admin/invoices/:id/send", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  await db.update(invoicesTable).set({ status: "sent" }).where(eq(invoicesTable.id, id));
  res.json({ ok: true });
});

// PATCH /admin/invoices/:id/paid — 入金済みに更新
router.patch("/admin/invoices/:id/paid", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "請求書なし" }); return; }

  await db.transaction(async (tx) => {
    await tx.update(invoicesTable).set({ status: "paid", paidAt: new Date() }).where(eq(invoicesTable.id, id));

    // 請求書の入金確認を、紐づく配送案件にも反映する。カード払いの状態を
    // 上書きしないよう、請求書払いの案件だけを対象にする。
    const invoiceItems = await tx.select({ shipmentId: invoiceItemsTable.shipmentId })
      .from(invoiceItemsTable)
      .where(eq(invoiceItemsTable.invoiceId, id));
    const shipmentIds = invoiceItems.map((item) => item.shipmentId).filter((shipmentId): shipmentId is number => shipmentId != null);
    if (shipmentIds.length > 0) {
      await tx.update(shipmentsTable)
        .set({ paymentStatus: "入金確認済み", updatedAt: new Date() })
        .where(and(
          inArray(shipmentsTable.id, shipmentIds),
          eq(shipmentsTable.paymentMethod, "invoice"),
        ));
    }

    // creditUsed を減算
    if (invoice.userId) {
      await tx.update(usersTable).set({
        creditUsed: sql`GREATEST(0, credit_used - ${Number(invoice.totalAmount)})`,
      }).where(eq(usersTable.id, invoice.userId));
    }
  });

  res.json({ ok: true });
});

export default router;
