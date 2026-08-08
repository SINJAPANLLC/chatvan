import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { sendEmail, buildEmailHtml, ADMIN_NOTIFY_EMAIL } from "../lib/email";

const router: IRouter = Router();

function fmt(c: any) {
  return {
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    repliedAt: c.repliedAt instanceof Date ? c.repliedAt.toISOString() : c.repliedAt,
  };
}

// ── 公開：お問い合わせ送信 ─────────────────────────────────────────────────────
router.post("/contact", async (req, res): Promise<void> => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: "すべての項目を入力してください" });
    return;
  }

  const [contact] = await db
    .insert(contactsTable)
    .values({ name, email, subject, message })
    .returning();

  // 管理者への通知メール（非同期・失敗しても送信完了扱い）
  {
    const html = buildEmailHtml({
      subject: `【Chat LOGI】新規お問い合わせ：${subject}`,
      body: `新しいお問い合わせが届きました。\n\n氏名：${name}\nメール：${email}\n件名：${subject}\n\n内容：\n${message}`,
      ctaText: "管理画面で確認する →",
    });
    sendEmail(
      ADMIN_NOTIFY_EMAIL,
      `【Chat LOGI】新規お問い合わせ：${subject}`,
      html,
    ).catch(() => {});
  }

  res.json({ ok: true, id: contact.id });
});

// ── 管理：一覧 ────────────────────────────────────────────────────────────────
router.get("/admin/contacts", requireAdmin, async (_req, res): Promise<void> => {
  const contacts = await db
    .select()
    .from(contactsTable)
    .orderBy(desc(contactsTable.createdAt));
  res.json({ contacts: contacts.map(fmt) });
});

// ── 管理：返信 ────────────────────────────────────────────────────────────────
router.post("/admin/contacts/:id/reply", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { body } = req.body as { body: string };
  if (!body?.trim()) { res.status(400).json({ error: "返信内容を入力してください" }); return; }

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, id))
    .limit(1);

  if (!contact) { res.status(404).json({ error: "お問い合わせが見つかりません" }); return; }

  // 返信メール送信
  const html = buildEmailHtml({
    subject: `Re: ${contact.subject}`,
    body: `${contact.name} 様\n\nお問い合わせいただきありがとうございます。\n\n${body}`,
    recipientName: contact.name,
    ctaText: "Chat LOGIを確認する →",
  });
  await sendEmail(contact.email, `Re: ${contact.subject}`, html);

  const [updated] = await db
    .update(contactsTable)
    .set({ replied: true, replyBody: body, repliedAt: new Date() })
    .where(eq(contactsTable.id, id))
    .returning();

  res.json(fmt(updated));
});

export default router;
