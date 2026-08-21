import { Router, type IRouter } from "express";
import { db, blogPostsTable } from "@workspace/db";
import { eq, desc, and, sql as drizzleSql } from "drizzle-orm";
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
// 公開記事一覧（ユーザー向けのみ公開）
router.get("/blog", async (_req, res): Promise<void> => {
  const posts = await db.select({
    id: blogPostsTable.id, slug: blogPostsTable.slug, title: blogPostsTable.title,
    excerpt: blogPostsTable.excerpt, category: blogPostsTable.category, tags: blogPostsTable.tags,
    publishedAt: blogPostsTable.publishedAt, createdAt: blogPostsTable.createdAt,
  }).from(blogPostsTable)
    .where(and(
      eq(blogPostsTable.published, true),
      drizzleSql`${blogPostsTable}.target_type = 'user'`
    ))
    .orderBy(desc(blogPostsTable.publishedAt));
  res.json(posts.map(fmt));
});

// 公開記事詳細
router.get("/blog/:slug", async (req, res): Promise<void> => {
  const [post] = await db.select().from(blogPostsTable)
    .where(and(
      eq(blogPostsTable.slug, req.params.slug),
      eq(blogPostsTable.published, true),
      drizzleSql`${blogPostsTable}.target_type = 'user'`
    ))
    .limit(1);
  if (!post) { res.status(404).json({ error: "記事が見つかりません" }); return; }
  res.json(fmt(post));
});

// ── 管理 API ──────────────────────────────────────────────────────────────────
// 全記事（管理者）?type=user|rental_company
router.get("/admin/blog", requireAdmin, async (req, res): Promise<void> => {
  const type = (req.query.type as string) || "user";
  const posts = await db.select().from(blogPostsTable)
    .where(drizzleSql`${blogPostsTable}.target_type = ${type}`)
    .orderBy(desc(blogPostsTable.createdAt));
  res.json(posts.map(fmt));
});

// 作成
router.post("/admin/blog", requireAdmin, async (req, res): Promise<void> => {
  const { slug, title, excerpt, content, category, tags, metaTitle, metaDescription, published, targetType } = req.body;
  if (!slug || !title || !content) { res.status(400).json({ error: "slug・title・contentは必須です" }); return; }
  const duplicateResult = await db.execute(drizzleSql`SELECT id FROM blog_posts WHERE slug = ${slug} LIMIT 1`);
  const duplicate = ((duplicateResult as any)?.rows ?? duplicateResult ?? [])[0];
  if (duplicate) { res.status(409).json({ error: "同じスラッグの記事がすでにあります" }); return; }
  const type = targetType ?? "user";
  const [post] = await db.execute(drizzleSql`
    INSERT INTO blog_posts (slug, title, excerpt, content, category, tags, meta_title, meta_description, published, published_at, target_type)
    VALUES (
      ${slug}, ${title}, ${excerpt ?? ""}, ${content},
      ${category ?? "Chat VANコラム"},
      ${tags ? JSON.stringify(tags) : null},
      ${metaTitle ?? null}, ${metaDescription ?? null},
      ${!!published}, ${published ? new Date() : null},
      ${type}
    )
    RETURNING *
  `);
  res.json(fmt(post as any));
});

// 更新
router.patch("/admin/blog/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { slug, title, excerpt, content, category, tags, metaTitle, metaDescription, published } = req.body;
  const [current] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "記事が見つかりません" }); return; }
  if (slug !== undefined && !String(slug).trim()) {
    res.status(400).json({ error: "スラッグは空にできません" }); return;
  }
  if (slug && slug !== current.slug) {
    const duplicateResult = await db.execute(drizzleSql`
      SELECT id FROM blog_posts WHERE slug = ${slug} AND id <> ${id} LIMIT 1
    `);
    const duplicate = ((duplicateResult as any)?.rows ?? duplicateResult ?? [])[0];
    if (duplicate) { res.status(409).json({ error: "同じスラッグの記事がすでにあります" }); return; }
  }

  const [post] = await db.update(blogPostsTable).set({
    slug: slug ?? current.slug,
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
  const { keyword, painPoint, targetType } = req.body as { keyword: string; painPoint?: string; targetType?: string };
  if (!keyword) { res.status(400).json({ error: "キーワードを入力してください" }); return; }

  const isRental = targetType === "rental_company";

  const systemPrompt = isRental
    ? "あなたはレンタカー・カーリース業界に特化したSEOコンテンツライターです。日本語のレンタル会社経営者・管理職に向けた、稼働率改善や収益向上に関する実用的なブログ記事を作成します。"
    : "あなたは軽バンレンタル業界に特化したSEOコンテンツライターです。日本語の法人担当者・個人事業主に向けた、検索意図に沿った実用的なブログ記事を作成します。";

  const readerDesc = isRental
    ? "レンタカー会社・リース会社の経営者・管理職"
    : "軽バンを利用したい法人担当者・個人事業主・配送業者";

  const ctaDesc = isRental
    ? "Chat VANへの車両提供・パートナー登録のCTA（「まずは無料でご相談ください」）"
    : "Chat VANで軽バンを探すCTA（「まずは無料でご相談ください」）";

  const categoryList = isRental
    ? "稼働率改善/収益アップ/コスト管理/運営効率化/パートナー活用"
    : "軽バン活用術/節約・コスト/レンタル基礎知識/個人事業主向け/法人向け/Chat VANコラム";

  const userPrompt = [
    `以下の条件でSEO記事を作成してください。`,
    ``,
    `メインキーワード: ${keyword}`,
    painPoint ? `ターゲットの悩み: ${painPoint}` : "",
    ``,
    `要件:`,
    `- 文字数: 1000〜1500文字`,
    `- 読者: ${readerDesc}`,
    `- 構成: ペインを強調→原因分析→解決策提示→Chat VANのCTA`,
    `- H2/H3を使った見出し構造（Markdownで記述）`,
    `- 読みやすく実践的な内容`,
    `- 末尾に${ctaDesc}`,
    ``,
    `出力形式はJSONのみ（マークダウン不要）:`,
    `{`,
    `  "title": "記事タイトル（55文字以内、キーワード含む）",`,
    `  "slug": "url-friendly-slug（英数字とハイフンのみ）",`,
    `  "excerpt": "記事の要約（120文字以内）",`,
    `  "metaTitle": "メタタイトル（60文字以内）",`,
    `  "metaDescription": "メタディスクリプション（120文字以内）",`,
    `  "category": "カテゴリ（${categoryList} のいずれか）",`,
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
router.get("/admin/blog/auto-gen", requireAdmin, async (req, res): Promise<void> => {
  const type = (req.query.type as string) || "user";
  res.json(await getStatus(type));
});

router.post("/admin/blog/auto-gen", requireAdmin, async (req, res): Promise<void> => {
  const { enabled, targetType } = req.body as { enabled: boolean; targetType?: string };
  const type = targetType ?? "user";
  await setEnabled(!!enabled, type);
  res.json(await getStatus(type));
});

router.post("/admin/blog/auto-gen/run", requireAdmin, async (req, res): Promise<void> => {
  const { targetType } = req.body as { targetType?: string };
  try {
    const result = await generateAndPublish(targetType ?? "user");
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
