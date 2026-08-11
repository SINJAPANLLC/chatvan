import { Router, type IRouter } from "express";
import { db, shipmentsTable, paymentsTable, invoicesTable, usersTable, carriersTable, vanContractsTable, rentalCompaniesTable, vehiclesTable } from "@workspace/db";
import { eq, sql, and, ne, isNotNull } from "drizzle-orm";
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

// ── VAN PL ────────────────────────────────────────────────────────────────────
// GET /admin/finance/van/pl?year=2026
// 月ごとに「契約が有効だった月」の売上・原価・粗利を集計
router.get("/admin/finance/van/pl", requireAdmin, async (req, res): Promise<void> => {
  const year = Number(req.query.year ?? new Date().getFullYear());

  // invoices テーブルからVAN請求書（INV-数字-...形式）の実績を月別集計
  const invRows = await db.execute(sql`
    SELECT
      TO_CHAR(i.created_at, 'YYYY-MM')   AS month,
      COUNT(*)                            AS invoice_count,
      SUM(i.total_amount)                 AS inv_revenue,
      COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0) AS inv_paid
    FROM invoices i
    WHERE EXTRACT(YEAR FROM i.created_at) = ${year}
      AND i.invoice_number ~ '^INV-[0-9]'
    GROUP BY TO_CHAR(i.created_at, 'YYYY-MM')
  `);
  const invoiceData: any[] = (invRows as any)?.rows ?? invRows;

  // payment_retries から成功したカード課金を月別集計
  const prRows = await db.execute(sql`
    SELECT
      TO_CHAR(pr.attempted_at, 'YYYY-MM') AS month,
      SUM(pr.amount)                       AS card_revenue,
      COUNT(*)                             AS card_count
    FROM payment_retries pr
    WHERE pr.result = 'success'
      AND EXTRACT(YEAR FROM pr.attempted_at) = ${year}
    GROUP BY TO_CHAR(pr.attempted_at, 'YYYY-MM')
  `);
  const cardData: any[] = (prRows as any)?.rows ?? prRows;

  // van_contracts から当年に有効な契約の月額（月単位の「契約売上ポテンシャル」）
  const contractRows = await db.execute(sql`
    SELECT
      TO_CHAR(vc.created_at, 'YYYY-MM') AS month,
      SUM(vc.monthly_price + COALESCE(vc.sin_japan_fee, 0)) AS contract_revenue,
      SUM(vc.monthly_price)                                  AS contract_cost,
      SUM(COALESCE(vc.sin_japan_fee, 0))                     AS contract_profit,
      COUNT(*)                                               AS contract_count
    FROM van_contracts vc
    WHERE vc.status::text IN ('active', 'delivery_pending', 'return_pending', 'payment_issue')
      AND EXTRACT(YEAR FROM vc.created_at) = ${year}
    GROUP BY TO_CHAR(vc.created_at, 'YYYY-MM')
  `);
  const contractData: any[] = (contractRows as any)?.rows ?? contractRows;

  // マージ
  const merged: Record<string, any> = {};
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2,'0')}`;
    merged[key] = { month: key, invoiceRevenue: 0, invoicePaid: 0, cardRevenue: 0, contractRevenue: 0, contractCost: 0, contractProfit: 0 };
  }
  for (const r of invoiceData) if (r.month && merged[r.month]) { merged[r.month].invoiceRevenue = Number(r.inv_revenue ?? 0); merged[r.month].invoicePaid = Number(r.inv_paid ?? 0); }
  for (const r of cardData)    if (r.month && merged[r.month]) { merged[r.month].cardRevenue = Number(r.card_revenue ?? 0); }
  for (const r of contractData) if (r.month && merged[r.month]) {
    merged[r.month].contractRevenue = Number(r.contract_revenue ?? 0);
    merged[r.month].contractCost    = Number(r.contract_cost    ?? 0);
    merged[r.month].contractProfit  = Number(r.contract_profit  ?? 0);
    merged[r.month].contractCount   = Number(r.contract_count   ?? 0);
  }

  const result = Object.values(merged).map((r: any) => {
    // 売上 = 請求書 + カード（実績） ＋ 契約ベース（ポテンシャル）を全部出す
    const revenue = r.cardRevenue + r.invoiceRevenue + r.contractRevenue;
    const cost    = r.contractCost;
    return {
      month:           r.month,
      revenue,          // 全合計
      cardRevenue:     r.cardRevenue,
      invoiceRevenue:  r.invoiceRevenue,
      invoicePaid:     r.invoicePaid,
      contractRevenue: r.contractRevenue, // 月額契約ベース
      cost:            r.contractCost,
      grossProfit:     r.contractProfit,
      profitRate:      r.contractRevenue > 0
        ? Math.round(r.contractProfit / r.contractRevenue * 1000) / 10 : 0,
      contractCount:   r.contractCount ?? 0,
    };
  });
  res.json(result);
});

// ── VAN レンタル会社支払い ────────────────────────────────────────────────────

// GET /admin/finance/van/rental-payments?year=2026&month=08
// 指定月に有効な契約をレンタル会社ごとに集計して支払い金額を返す
router.get("/admin/finance/van/rental-payments", requireAdmin, async (req, res): Promise<void> => {
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);
  const ym    = `${year}-${String(month).padStart(2, '0')}`;

  // 当月末・翌月末を計算
  const lastDay  = new Date(year, month, 0).getDate();
  const nextYear  = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextLastDay = new Date(nextYear, nextMonth, 0).getDate();
  const dueDate = `${nextYear}/${String(nextMonth).padStart(2,'0')}/${String(nextLastDay).padStart(2,'0')}`;
  const billingPeriod = `${year}/${String(month).padStart(2,'0')}/01 〜 ${year}/${String(month).padStart(2,'0')}/${String(lastDay).padStart(2,'0')}`;

  // 有効な契約（active / delivery_pending / return_pending / payment_issue）をレンタル会社ごとに取得
  const rows = await db.execute(sql`
    SELECT
      rc.id              AS rental_company_id,
      rc.name            AS rental_company_name,
      rc.email           AS rental_company_email,
      rc.phone           AS rental_company_phone,
      rc.address         AS rental_company_address,
      vc.id              AS contract_id,
      vc.monthly_price,
      v.name             AS vehicle_name,
      v.registration_number AS vehicle_number,
      v.maker            AS vehicle_maker,
      u.name             AS user_name,
      u.company_name     AS user_company
    FROM van_contracts vc
    JOIN rental_companies rc ON vc.rental_company_id = rc.id
    LEFT JOIN vehicles v     ON vc.vehicle_id = v.id
    LEFT JOIN users u        ON vc.user_id = u.id
    WHERE vc.status::text IN ('active', 'delivery_pending', 'return_pending', 'payment_issue')
      AND vc.rental_company_id IS NOT NULL
    ORDER BY rc.name, vc.id
  `);

  const contractRows: any[] = (rows as any)?.rows ?? rows;

  // レンタル会社でグループ化
  const companyMap = new Map<number, any>();
  for (const r of contractRows) {
    const rcId = Number(r.rental_company_id);
    if (!companyMap.has(rcId)) {
      companyMap.set(rcId, {
        rentalCompanyId:   rcId,
        rentalCompanyName: r.rental_company_name,
        email:             r.rental_company_email,
        phone:             r.rental_company_phone,
        address:           r.rental_company_address,
        contracts: [],
        totalAmount: 0,
      });
    }
    const co = companyMap.get(rcId)!;
    const price = Number(r.monthly_price ?? 0);
    co.contracts.push({
      contractId:   Number(r.contract_id),
      vehicleName:  r.vehicle_name ?? '—',
      vehicleNumber: r.vehicle_number ?? '—',
      vehicleMaker: r.vehicle_maker ?? '',
      monthlyPrice: price,
      userName:     r.user_company || r.user_name || '—',
    });
    co.totalAmount += price;
  }

  res.json({
    billingMonth:  ym,
    billingPeriod,
    dueDate,
    paymentCycle:  '月末締め翌月末払い',
    companies: Array.from(companyMap.values()),
  });
});

// GET /admin/finance/van/rental-payment-statement?rentalCompanyId=1&year=2026&month=08
// 印刷用支払い明細 HTML を返す
router.get("/admin/finance/van/rental-payment-statement", requireAdmin, async (req, res): Promise<void> => {
  const rcId  = parseInt(String(req.query.rentalCompanyId ?? 0));
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);

  const lastDay    = new Date(year, month, 0).getDate();
  const nextYear   = month === 12 ? year + 1 : year;
  const nextMonth  = month === 12 ? 1 : month + 1;
  const nextLastDay = new Date(nextYear, nextMonth, 0).getDate();
  const dueDate    = `${nextYear}年${String(nextMonth).padStart(2,'0')}月${String(nextLastDay).padStart(2,'0')}日`;
  const billingPeriod = `${year}年${String(month).padStart(2,'0')}月01日 〜 ${year}年${String(month).padStart(2,'0')}月${String(lastDay).padStart(2,'0')}日`;
  const issuedDate = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' });

  const rows = await db.execute(sql`
    SELECT
      rc.name AS rc_name, rc.address AS rc_address, rc.email AS rc_email, rc.phone AS rc_phone,
      vc.id AS contract_id, vc.monthly_price,
      v.name AS vehicle_name, v.registration_number AS vehicle_number, v.maker,
      u.name AS user_name, u.company_name AS user_company
    FROM van_contracts vc
    JOIN rental_companies rc ON vc.rental_company_id = rc.id
    LEFT JOIN vehicles v     ON vc.vehicle_id = v.id
    LEFT JOIN users u        ON vc.user_id = u.id
    WHERE vc.rental_company_id = ${rcId}
      AND vc.status::text IN ('active', 'delivery_pending', 'return_pending', 'payment_issue')
    ORDER BY vc.id
  `);
  const contracts: any[] = (rows as any)?.rows ?? rows;

  const total = contracts.reduce((s, r) => s + Number(r.monthly_price ?? 0), 0);
  const fmt = (n: number) => new Intl.NumberFormat('ja-JP').format(Math.round(n));
  const rcName = contracts[0]?.rc_name ?? '—';

  const tableRows = contracts.map(r => `
    <tr>
      <td>${r.vehicle_name ?? '—'}</td>
      <td>${r.vehicle_number ?? '—'}</td>
      <td>${r.user_company || r.user_name || '—'}</td>
      <td class="num">¥${fmt(Number(r.monthly_price ?? 0))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>支払い明細書 ${year}年${month}月</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", sans-serif; font-size: 13px; color: #111; padding: 48px; max-width: 860px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #555; margin-bottom: 32px; }
  .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .label { font-size: 11px; color: #888; margin-bottom: 2px; }
  .value { font-size: 14px; font-weight: 600; }
  .amount-box { background: #f4f4f4; border-radius: 8px; padding: 20px 24px; margin-bottom: 32px; }
  .amount-label { font-size: 12px; color: #666; margin-bottom: 4px; }
  .amount-value { font-size: 32px; font-weight: 700; letter-spacing: -1px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  th { background: #111; color: #fff; padding: 9px 12px; text-align: left; font-size: 12px; font-weight: 600; }
  th.num, td.num { text-align: right; }
  td { padding: 9px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  .total-row td { font-weight: 700; background: #f9f9f9; border-top: 2px solid #111; }
  .footer { font-size: 11px; color: #888; border-top: 1px solid #e5e5e5; padding-top: 16px; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
  <h1>支払い明細書</h1>
  <div class="meta">発行日: ${issuedDate} ／ 支払いサイト: 月末締め翌月末払い</div>

  <div class="header-grid">
    <div>
      <div class="label">支払先</div>
      <div class="value">${rcName}</div>
    </div>
    <div>
      <div class="label">対象期間</div>
      <div class="value">${billingPeriod}</div>
      <div style="font-size:12px;color:#555;margin-top:4px;">支払期限: ${dueDate}</div>
    </div>
  </div>

  <div class="amount-box">
    <div class="amount-label">お支払い合計金額</div>
    <div class="amount-value">¥${fmt(total)}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>車両名</th>
        <th>ナンバー</th>
        <th>利用者</th>
        <th class="num">月額（税込）</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3">合計</td>
        <td class="num">¥${fmt(total)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    Chat VAN 運営事務局 ／ 本明細について不明点がある場合はご連絡ください。
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
