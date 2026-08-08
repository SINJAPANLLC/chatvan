import { Router, type IRouter } from "express";
import { db, blogPostsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getStatus, setEnabled, generateAndPublish } from "../lib/blogAutoGen";

const router: IRouter = Router();

function fmt(p: any) {
  return {
    ...p,
    createdAt:   p.createdAt   instanceof Date ? p.createdAt.toISOString()   : p.createdAt,
    updatedAt:   p.updatedAt   instanceof Date ? p.updatedAt.toISOString()   : p.updatedAt,
    publishedAt: p.publishedAt instanceof Date ? p.publishedAt.toISOString() : p.publishedAt,
  };
}

// ── 公開 API ──────────────────────────────────────────────────────────────────
// 公開記事一覧
router.get("/blog", async (_req, res): Promise<void> => {
  const posts = await db.select({
    id: blogPostsTable.id, slug: blogPostsTable.slug, title: blogPostsTable.title,
    excerpt: blogPostsTable.excerpt, category: blogPostsTable.category, tags: blogPostsTable.tags,
    publishedAt: blogPostsTable.publishedAt, createdAt: blogPostsTable.createdAt,
  }).from(blogPostsTable)
    .where(eq(blogPostsTable.published, true))
    .orderBy(desc(blogPostsTable.publishedAt));
  res.json(posts.map(fmt));
});

// 公開記事詳細
router.get("/blog/:slug", async (req, res): Promise<void> => {
  const [post] = await db.select().from(blogPostsTable)
    .where(eq(blogPostsTable.slug, req.params.slug))
    .limit(1);
  if (!post || !post.published) { res.status(404).json({ error: "記事が見つかりません" }); return; }
  res.json(fmt(post));
});

// ── 管理 API ──────────────────────────────────────────────────────────────────
// 全記事（管理者）
router.get("/admin/blog", requireAdmin, async (_req, res): Promise<void> => {
  const posts = await db.select().from(blogPostsTable).orderBy(desc(blogPostsTable.createdAt));
  res.json(posts.map(fmt));
});

// 作成
router.post("/admin/blog", requireAdmin, async (req, res): Promise<void> => {
  const { slug, title, excerpt, content, category, tags, metaTitle, metaDescription, published } = req.body;
  if (!slug || !title || !content) { res.status(400).json({ error: "slug・title・contentは必須です" }); return; }
  const [post] = await db.insert(blogPostsTable).values({
    slug, title, excerpt: excerpt ?? "", content, category: category ?? "物流コラム",
    tags: tags ? JSON.stringify(tags) : null,
    metaTitle: metaTitle ?? null, metaDescription: metaDescription ?? null,
    published: !!published,
    publishedAt: published ? new Date() : null,
  }).returning();
  res.json(fmt(post));
});

// 更新
router.patch("/admin/blog/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { title, excerpt, content, category, tags, metaTitle, metaDescription, published } = req.body;
  const [current] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "記事が見つかりません" }); return; }

  const [post] = await db.update(blogPostsTable).set({
    title: title ?? current.title,
    excerpt: excerpt ?? current.excerpt,
    content: content ?? current.content,
    category: category ?? current.category,
    tags: tags ? JSON.stringify(tags) : current.tags,
    metaTitle: metaTitle ?? current.metaTitle,
    metaDescription: metaDescription ?? current.metaDescription,
    published: published !== undefined ? !!published : current.published,
    publishedAt: (published && !current.publishedAt) ? new Date() : current.publishedAt,
    updatedAt: new Date(),
  }).where(eq(blogPostsTable.id, id)).returning();
  res.json(fmt(post));
});

// 削除
router.delete("/admin/blog/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(blogPostsTable).where(eq(blogPostsTable.id, id));
  res.json({ ok: true });
});

// ── AI記事生成 ────────────────────────────────────────────────────────────────
router.post("/admin/blog/generate", requireAdmin, async (req, res): Promise<void> => {
  const { keyword, painPoint } = req.body as { keyword: string; painPoint?: string };
  if (!keyword) { res.status(400).json({ error: "キーワードを入力してください" }); return; }

  const systemPrompt = [
    "あなたは物流業界に特化したSEOコンテンツライターです。",
    "日本語の物流担当者・経営者に向けた、検索意図に沿った実用的なブログ記事を作成します。",
  ].join("\n");

  const userPrompt = [
    `以下の条件でSEO記事を作成してください。`,
    ``,
    `メインキーワード: ${keyword}`,
    painPoint ? `ターゲットの悩み: ${painPoint}` : "",
    ``,
    `要件:`,
    `- 文字数: 1000〜1500文字`,
    `- 読者: 物流担当者・中小企業の経営者`,
    `- 構成: ペインを強調→原因分析→解決策提示→Chat LOGIのCTA`,
    `- H2/H3を使った見出し構造（Markdownで記述）`,
    `- 読みやすく実践的な内容`,
    `- 末尾にChat LOGIへの誘導CTA（「まずは無料でご相談ください」）`,
    ``,
    `出力形式はJSONのみ（マークダウン不要）:`,
    `{`,
    `  "title": "記事タイトル（55文字以内、キーワード含む）",`,
    `  "slug": "url-friendly-slug（英数字とハイフンのみ）",`,
    `  "excerpt": "記事の要約（120文字以内）",`,
    `  "metaTitle": "メタタイトル（60文字以内）",`,
    `  "metaDescription": "メタディスクリプション（120文字以内）",`,
    `  "category": "カテゴリ（コスト削減/物流DX/運送会社選び/物流戦略/物流運営 のいずれか）",`,
    `  "tags": ["タグ1", "タグ2", "タグ3"],`,
    `  "content": "Markdown形式の本文（## で見出し）"`,
    `}`,
  ].filter(Boolean).join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    max_completion_tokens: 3000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let data: any = {};
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    data = JSON.parse(cleaned);
  } catch {
    res.status(500).json({ error: "AI生成結果の解析に失敗しました", raw }); return;
  }

  res.json(data);
});

// ── 自動生成スケジューラー設定 ──────────────────────────────────────────────────
// GET /admin/blog/auto-gen — ステータス取得
router.get("/admin/blog/auto-gen", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await getStatus());
});

// POST /admin/blog/auto-gen — 有効/無効切替
router.post("/admin/blog/auto-gen", requireAdmin, async (req, res): Promise<void> => {
  const { enabled } = req.body as { enabled: boolean };
  await setEnabled(!!enabled);
  res.json(await getStatus());
});

// POST /admin/blog/auto-gen/run — 手動で今すぐ1記事生成
router.post("/admin/blog/auto-gen/run", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await generateAndPublish();
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
