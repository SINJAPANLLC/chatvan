import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { eq, ne, desc, count, ilike, or, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { sendEmail, buildEmailHtml, ADMIN_NOTIFY_EMAIL } from "../lib/email";
import { logUserActivity } from "../lib/userLogger";
import { logAdminAudit } from "../lib/auditLogger";

const router: IRouter = Router();

function fmt(c: any) {
  return {
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    repliedAt: c.repliedAt instanceof Date ? c.repliedAt.toISOString() : c.repliedAt,
    replyEmailSentAt: c.replyEmailSentAt instanceof Date ? c.replyEmailSentAt.toISOString() : c.replyEmailSentAt,
    adminNotifiedAt: c.adminNotifiedAt instanceof Date ? c.adminNotifiedAt.toISOString() : c.adminNotifiedAt,
  };
}

const CONTACT_RATE_WINDOW_MS = 60_000;
const recentContactRequests = new Map<string, number>();

function emailDeliveryStatus(result: { sent: boolean; reason?: string }): "sent" | "failed" | "skipped" {
  if (result.sent) return "sent";
  return result.reason?.includes("SMTP未設定") ? "skipped" : "failed";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ── 公開：お問い合わせ送信 ─────────────────────────────────────────────────────
router.post("/contact", async (req, res): Promise<void> => {
  const name = normalizeText(req.body?.name);
  const email = normalizeText(req.body?.email).toLowerCase();
  const subject = normalizeText(req.body?.subject);
  const message = normalizeText(req.body?.message);
  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: "すべての項目を入力してください" });
    return;
  }
  if (name.length > 100 || subject.length > 200 || message.length > 5_000) {
    res.status(400).json({ error: "氏名は100文字、件名は200文字、内容は5,000文字以内にしてください" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "メールアドレスの形式を確認してください" });
    return;
  }
  const rateKey = `${req.ip ?? "unknown"}:${email}`;
  const previous = recentContactRequests.get(rateKey);
  if (previous && Date.now() - previous < CONTACT_RATE_WINDOW_MS) {
    res.status(429).json({ error: "短時間に連続して送信されています。しばらくしてからお試しください" });
    return;
  }
  recentContactRequests.set(rateKey, Date.now());

  const [contact] = await db
    .insert(contactsTable)
    .values({ name, email, subject, message })
    .returning();

  // 管理者への通知メール。失敗も記録して、管理画面で見逃さない。
  try {
    const html = buildEmailHtml({
      subject: `【Chat VAN】新規お問い合わせ：${subject}`,
      body: `新しいお問い合わせが届きました。\n\n氏名：${name}\nメール：${email}\n件名：${subject}\n\n内容：\n${message}`,
      ctaText: "管理画面で確認する →",
    });
    const result = await sendEmail(
      ADMIN_NOTIFY_EMAIL,
      `【Chat VAN】新規お問い合わせ：${subject}`,
      html,
    );
    const status = emailDeliveryStatus(result);
    await db.update(contactsTable).set({
      adminNotifyStatus: status,
      adminNotifyError: result.sent ? null : result.reason ?? "管理者通知の送信に失敗しました",
      adminNotifiedAt: result.sent ? new Date() : null,
    }).where(eq(contactsTable.id, contact.id));
  } catch (error: any) {
    await db.update(contactsTable).set({
      adminNotifyStatus: "failed",
      adminNotifyError: error?.message ?? "管理者通知の送信に失敗しました",
    }).where(eq(contactsTable.id, contact.id));
  }

  logUserActivity({ action: "contact_sent", detail: `件名: ${subject}`, targetId: contact.id, targetType: "contact", req }).catch(() => {});
  res.json({ ok: true, id: contact.id });
});

// ── 管理：一覧 ────────────────────────────────────────────────────────────────
router.get("/admin/contacts", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const status = req.query.status === "replied" ? "replied" : req.query.status === "unreplied" ? "unreplied" : "";
  const searchFilter = query ? or(
    ilike(contactsTable.name, `%${query}%`),
    ilike(contactsTable.email, `%${query}%`),
    ilike(contactsTable.subject, `%${query}%`),
    ilike(contactsTable.message, `%${query}%`),
  ) : undefined;
  const statusFilter = status === "replied"
    ? eq(contactsTable.replied, true)
    : status === "unreplied" ? eq(contactsTable.replied, false) : undefined;
  const filter = searchFilter && statusFilter ? and(searchFilter, statusFilter) : searchFilter ?? statusFilter;
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(filter)
    .orderBy(desc(contactsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [totalRow] = await db.select({ total: count() }).from(contactsTable).where(filter);
  res.json({ contacts: contacts.map(fmt), total: Number(totalRow?.total ?? 0), limit, offset });
});

// ── 管理：返信 ────────────────────────────────────────────────────────────────
router.post("/admin/contacts/:id/reply", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const body = normalizeText(req.body?.body);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "無効なお問い合わせIDです" }); return; }
  if (!body) { res.status(400).json({ error: "返信内容を入力してください" }); return; }
  if (body.length > 5_000) { res.status(400).json({ error: "返信内容は5,000文字以内にしてください" }); return; }

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, id))
    .limit(1);

  if (!contact) { res.status(404).json({ error: "お問い合わせが見つかりません" }); return; }
  if (contact.replied) {
    res.status(409).json({ error: "このお問い合わせには返信内容が記録されています。再送操作を使用してください" });
    return;
  }

  const adminId = (req.session as any)?.userId ?? null;
  const [claimed] = await db.update(contactsTable).set({
    replied: true,
    replyBody: body,
    repliedAt: new Date(),
    repliedBy: adminId,
    replyEmailStatus: "sending",
    replyEmailError: null,
  }).where(and(eq(contactsTable.id, id), eq(contactsTable.replied, false))).returning({ id: contactsTable.id });
  if (!claimed) {
    res.status(409).json({ error: "このお問い合わせは、すでに別の担当者が返信処理を開始しています" });
    return;
  }

  // 返信メール送信
  const html = buildEmailHtml({
    subject: `Re: ${contact.subject}`,
    body: `${contact.name} 様\n\nお問い合わせいただきありがとうございます。\n\n${body}`,
    recipientName: contact.name,
    ctaText: "Chat VANを確認する →",
  });
  try {
    const result = await sendEmail(contact.email, `Re: ${contact.subject}`, html);
    const status = emailDeliveryStatus(result);
    const [updated] = await db.update(contactsTable).set({
      replyEmailStatus: status,
      replyEmailError: result.sent ? null : result.reason ?? "返信メールの送信に失敗しました",
      replyEmailSentAt: result.sent ? new Date() : null,
    }).where(eq(contactsTable.id, id)).returning();
    await logAdminAudit(req, { action: "reply", targetType: "contact", targetId: id, afterData: { emailStatus: status } });
    res.json(fmt(updated));
  } catch (error: any) {
    const reason = error?.message ?? "返信メールの送信に失敗しました";
    const [updated] = await db.update(contactsTable).set({ replyEmailStatus: "failed", replyEmailError: reason })
      .where(eq(contactsTable.id, id)).returning();
    await logAdminAudit(req, { action: "reply", targetType: "contact", targetId: id, afterData: { emailStatus: "failed" } });
    res.status(502).json({ error: reason, contact: fmt(updated) });
  }
});

// ── 管理：失敗または未送信の返信を再送 ──────────────────────────────────────────
router.post("/admin/contacts/:id/reply/resend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "無効なお問い合わせIDです" }); return; }
  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, id)).limit(1);
  if (!contact?.replyBody) { res.status(404).json({ error: "再送できる返信内容がありません" }); return; }
  if (contact.replyEmailStatus === "sent") { res.status(409).json({ error: "この返信メールは送信済みです" }); return; }

  const [claimed] = await db.update(contactsTable).set({ replyEmailStatus: "sending", replyEmailError: null })
    .where(and(
      eq(contactsTable.id, id),
      ne(contactsTable.replyEmailStatus, "sent"),
      ne(contactsTable.replyEmailStatus, "sending"),
    ))
    .returning({ id: contactsTable.id });
  if (!claimed) {
    res.status(409).json({ error: "この返信メールはすでに送信済み、または送信処理中です" });
    return;
  }
  try {
    const html = buildEmailHtml({
      subject: `Re: ${contact.subject}`,
      body: `${contact.name} 様\n\nお問い合わせいただきありがとうございます。\n\n${contact.replyBody}`,
      recipientName: contact.name,
      ctaText: "Chat VANを確認する →",
    });
    const result = await sendEmail(contact.email, `Re: ${contact.subject}`, html);
    const status = emailDeliveryStatus(result);
    const [updated] = await db.update(contactsTable).set({
      replyEmailStatus: status,
      replyEmailError: result.sent ? null : result.reason ?? "返信メールの送信に失敗しました",
      replyEmailSentAt: result.sent ? new Date() : null,
    }).where(eq(contactsTable.id, id)).returning();
    await logAdminAudit(req, { action: "resend", targetType: "contact_reply", targetId: id, afterData: { emailStatus: status } });
    res.json(fmt(updated));
  } catch (error: any) {
    const reason = error?.message ?? "返信メールの送信に失敗しました";
    await db.update(contactsTable).set({ replyEmailStatus: "failed", replyEmailError: reason }).where(eq(contactsTable.id, id));
    res.status(502).json({ error: reason });
  }
});

export default router;
