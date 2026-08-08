import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// 法人番号バリデーション（13桁数字）
function isValidCorporateNumber(n: string): boolean {
  return /^\d{13}$/.test(n);
}

// GET /corporate/status — 自分の法人口座ステータス取得
router.get("/corporate/status", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
  if (!user) { res.status(404).json({ error: "ユーザーが見つかりません" }); return; }

  res.json({
    isCompany: user.isCompany,
    corporateNumber: user.corporateNumber,
    creditStatus: user.creditStatus,
    creditLimit: Number(user.creditLimit ?? 0),
    creditUsed: Number(user.creditUsed ?? 0),
    creditAvailable: Number(user.creditLimit ?? 0) - Number(user.creditUsed ?? 0),
    paymentTerms: user.paymentTerms,
    preferredPaymentMethod: user.preferredPaymentMethod,
  });
});

// POST /corporate/apply — 法人口座申請
router.post("/corporate/apply", requireAuth, async (req, res): Promise<void> => {
  const { corporateNumber, companyName, phone, billingAddress, paymentTerms } = req.body;

  if (!corporateNumber || !isValidCorporateNumber(String(corporateNumber))) {
    res.status(400).json({ error: "法人番号は13桁の数字で入力してください" });
    return;
  }
  if (!companyName) {
    res.status(400).json({ error: "会社名は必須です" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
  if (!user) { res.status(404).json({ error: "ユーザーが見つかりません" }); return; }

  if (user.creditStatus === "approved") {
    res.status(400).json({ error: "すでに法人口座が承認されています" });
    return;
  }
  if (user.creditStatus === "pending") {
    res.status(400).json({ error: "審査中です。承認をお待ちください" });
    return;
  }

  await db.update(usersTable).set({
    isCompany: true,
    corporateNumber: String(corporateNumber),
    companyName,
    phone: phone ?? user.phone,
    billingAddress: billingAddress ?? user.billingAddress,
    paymentTerms: paymentTerms ?? "Net30",
    creditStatus: "pending",
    preferredPaymentMethod: "card", // 承認後にinvoiceに変更
  }).where(eq(usersTable.id, req.session.userId!));

  res.json({ message: "申請を受け付けました。審査後にご連絡します。" });
});

// ── 管理者エンドポイント ──────────────────────────────────────────────────────

// GET /admin/corporate — 申請一覧
router.get("/admin/corporate", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    companyName: usersTable.companyName,
    corporateNumber: usersTable.corporateNumber,
    creditStatus: usersTable.creditStatus,
    creditLimit: usersTable.creditLimit,
    creditUsed: usersTable.creditUsed,
    paymentTerms: usersTable.paymentTerms,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.isCompany, true));

  res.json(users.map(u => ({
    ...u,
    creditLimit: Number(u.creditLimit ?? 0),
    creditUsed: Number(u.creditUsed ?? 0),
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
  })));
});

// PATCH /admin/corporate/:userId/approve — 承認 + 与信枠設定
router.patch("/admin/corporate/:userId/approve", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  const { creditLimit, paymentTerms } = req.body;

  if (!creditLimit || isNaN(Number(creditLimit))) {
    res.status(400).json({ error: "与信枠（creditLimit）を指定してください" });
    return;
  }

  await db.update(usersTable).set({
    creditStatus: "approved",
    creditLimit: Number(creditLimit).toString(),
    paymentTerms: paymentTerms ?? "Net30",
    preferredPaymentMethod: "invoice",
  }).where(eq(usersTable.id, userId));

  res.json({ message: "承認しました" });
});

// PATCH /admin/corporate/:userId/reject — 却下
router.patch("/admin/corporate/:userId/reject", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  await db.update(usersTable).set({ creditStatus: "rejected" }).where(eq(usersTable.id, userId));
  res.json({ message: "却下しました" });
});

// PATCH /admin/corporate/:userId/suspend — 停止
router.patch("/admin/corporate/:userId/suspend", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  await db.update(usersTable).set({
    creditStatus: "suspended",
    preferredPaymentMethod: "card",
  }).where(eq(usersTable.id, userId));
  res.json({ message: "停止しました" });
});

// PATCH /admin/corporate/:userId/credit-limit — 与信枠変更
router.patch("/admin/corporate/:userId/credit-limit", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  const { creditLimit } = req.body;
  if (!creditLimit || isNaN(Number(creditLimit))) {
    res.status(400).json({ error: "creditLimit を指定してください" });
    return;
  }
  await db.update(usersTable).set({ creditLimit: Number(creditLimit).toString() }).where(eq(usersTable.id, userId));
  res.json({ message: "与信枠を更新しました" });
});

export default router;
