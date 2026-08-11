import { Router, type IRouter } from "express";
import { db, prospectsTable } from "@workspace/db";
import { eq, inArray, and, sql as drizzleSql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendEmail, buildSalesEmailHtml } from "../lib/email";
import { runAutoProspect, lastRunLog } from "../lib/autoProspect";

const router: IRouter = Router();

// ── リスト取得 ────────────────────────────────────────────────────────────────
router.get("/admin/prospects", requireAdmin, async (req, res): Promise<void> => {
  const type = (req.query.type as string) || "user";
  const rows = await db.select().from(prospectsTable)
    .where(eq(drizzleSql`${prospectsTable}.prospect_type`, type))
    .orderBy(prospectsTable.createdAt);
  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    sentAt:    r.sentAt    instanceof Date ? r.sentAt.toISOString()    : r.sentAt,
  })));
});

// ── 1件追加 ───────────────────────────────────────────────────────────────────
router.post("/admin/prospects", requireAdmin, async (req, res): Promise<void> => {
  const { companyName, contactName, email, phone, industry, prefecture, notes, prospectType } = req.body;
  if (!companyName || !email) { res.status(400).json({ error: "会社名とメールアドレスは必須です" }); return; }
  const [row] = await db.execute(drizzleSql`
    INSERT INTO prospects (company_name, contact_name, email, phone, industry, prefecture, notes, prospect_type)
    VALUES (${companyName}, ${contactName ?? null}, ${email}, ${phone ?? null}, ${industry ?? null}, ${prefecture ?? null}, ${notes ?? null}, ${prospectType ?? 'user'})
    RETURNING *
  `);
  res.json((row as any));
});

// ── CSV一括追加 ───────────────────────────────────────────────────────────────
router.post("/admin/prospects/import", requireAdmin, async (req, res): Promise<void> => {
  const { rows, prospectType } = req.body as { rows: any[]; prospectType?: string };
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "データがありません" }); return; }
  const valid = rows.filter(r => r.companyName && r.email);
  if (valid.length === 0) { res.status(400).json({ error: "有効なデータがありません（会社名・メールアドレス必須）" }); return; }
  const type = prospectType ?? "user";
  let inserted = 0;
  for (const r of valid) {
    await db.execute(drizzleSql`
      INSERT INTO prospects (company_name, contact_name, email, phone, industry, prefecture, notes, prospect_type)
      VALUES (${r.companyName}, ${r.contactName ?? null}, ${r.email}, ${r.phone ?? null}, ${r.industry ?? null}, ${r.prefecture ?? null}, ${r.notes ?? null}, ${type})
    `);
    inserted++;
  }
  res.json({ inserted });
});

// ── AI自動生成 ────────────────────────────────────────────────────────────────
router.post("/admin/prospects/generate", requireAdmin, async (req, res): Promise<void> => {
  const { industry, prefecture, count = 10, prospectType } = req.body as { industry: string; prefecture: string; count?: number; prospectType?: string };
  if (!industry || !prefecture) { res.status(400).json({ error: "業種と都道府県を指定してください" }); return; }

  const n = Math.min(Math.max(Number(count), 5), 30);
  const type = prospectType ?? "user";

  const prompt = [
    "あなたは日本の法人リストを生成するアシスタントです。",
    `以下の条件で架空の（ただし実在しそうな）企業リストを${n}件生成してください。`,
    "",
    `業種: ${industry}`,
    `都道府県: ${prefecture}`,
    "",
    "出力形式はJSONの配列のみ（マークダウン不要）。各要素は以下のフィールドを含めてください:",
    "- companyName: 正式な日本語社名（株式会社/有限会社等含む）",
    "- contactName: 担当者の氏名（日本人名、姓＋名）",
    `- email: ビジネスメールアドレス（実在しない形式。例: info@company-name.co.jp）`,
    "- phone: 市外局番から始まる電話番号（ハイフン区切り）",
    `- industry: "${industry}"`,
    `- prefecture: "${prefecture}"`,
    "",
    "必ずJSON配列のみを出力し、説明文や前置きは一切不要です。",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    max_completion_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = completion.choices[0]?.message?.content ?? "[]";
  let generated: any[] = [];
  try {
    const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    generated = JSON.parse(cleaned);
  } catch {
    res.status(500).json({ error: "AI生成結果の解析に失敗しました" }); return;
  }

  const valid = generated.filter((r: any) => r.companyName && r.email);
  if (valid.length === 0) { res.status(500).json({ error: "生成に失敗しました" }); return; }

  let inserted = 0;
  for (const r of valid) {
    await db.execute(drizzleSql`
      INSERT INTO prospects (company_name, contact_name, email, phone, industry, prefecture, notes, prospect_type)
      VALUES (${r.companyName}, ${r.contactName ?? null}, ${r.email}, ${r.phone ?? null}, ${r.industry ?? industry}, ${r.prefecture ?? prefecture}, ${null}, ${type})
    `);
    inserted++;
  }

  res.json({ inserted });
});

// ── 自動クロール（手動トリガー） ───────────────────────────────────────────────
router.post("/admin/prospects/auto-crawl", requireAdmin, async (_req, res): Promise<void> => {
  res.json({ message: "自動クロールを開始しました。数分後にリストを確認してください。" });
  runAutoProspect().catch(e => console.error("[AutoCrawl]", e.message));
});

// ── 自動クロール ステータス ────────────────────────────────────────────────────
router.get("/admin/prospects/auto-crawl/status", requireAdmin, (_req, res): void => {
  res.json(lastRunLog ?? null);
});

// ── 削除 ──────────────────────────────────────────────────────────────────────
router.delete("/admin/prospects/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(prospectsTable).where(eq(prospectsTable.id, id));
  res.json({ ok: true });
});

// ── 一括削除 ─────────────────────────────────────────────────────────────────
router.delete("/admin/prospects", requireAdmin, async (req, res): Promise<void> => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "IDを指定してください" }); return; }
  await db.delete(prospectsTable).where(inArray(prospectsTable.id, ids));
  res.json({ ok: true });
});

// ── 営業メール送信 ─────────────────────────────────────────────────────────────
router.post("/admin/prospects/send", requireAdmin, async (req, res): Promise<void> => {
  const { ids, subject, bodyText, ctaText, ctaUrl } = req.body as {
    ids: number[]; subject: string; bodyText: string; ctaText?: string; ctaUrl?: string;
  };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "送信先を指定してください" }); return; }
  if (!subject || !bodyText) { res.status(400).json({ error: "件名とメール本文は必須です" }); return; }

  const targets = await db.select().from(prospectsTable).where(inArray(prospectsTable.id, ids));
  if (targets.length === 0) { res.status(400).json({ error: "送信対象が見つかりません" }); return; }

  const results: { id: number; email: string; sent: boolean; reason?: string }[] = [];

  for (const t of targets) {
    const html = buildSalesEmailHtml({
      subject,
      bodyText,
      companyName: t.companyName,
      contactName: t.contactName ?? undefined,
      ctaText,
      ctaUrl,
    });

    const result = await sendEmail(t.email, subject, html);
    results.push({ id: t.id, email: t.email, ...result });

    if (result.sent) {
      await db.update(prospectsTable)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(prospectsTable.id, t.id));
    }
  }

  const sentCount = results.filter(r => r.sent).length;
  res.json({ message: `${targets.length}件中${sentCount}件の送信成功`, results });
});

export default router;
