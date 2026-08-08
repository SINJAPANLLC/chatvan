import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { blogPostsTable } from "@workspace/db";
import { like, eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// ── サイトマップ（公開・認証不要） ────────────────────────────────────────────
router.get("/sitemap.xml", async (_req, res): Promise<void> => {
  // DBからサイトURLを取得（設定されていなければ環境変数 or デフォルト）
  const siteUrlRow = await db.select().from(settingsTable)
    .where(eq(settingsTable.key, "seo_siteUrl")).limit(1).catch(() => []);
  const baseUrl = (siteUrlRow[0]?.value ?? process.env.SITE_URL ?? "https://chatlogi.jp").replace(/\/$/, "");

  // 静的ページ
  const staticPages = [
    { path: "/",        priority: "1.0", changefreq: "weekly"  },
    { path: "/blog",    priority: "0.8", changefreq: "daily"   },
    { path: "/login",   priority: "0.3", changefreq: "monthly" },
    { path: "/register",priority: "0.3", changefreq: "monthly" },
  ];

  // ブログ記事（公開済みのみ）
  const posts = await db.select({
    slug:      blogPostsTable.slug,
    updatedAt: blogPostsTable.updatedAt,
  }).from(blogPostsTable)
    .where(eq(blogPostsTable.published, true))
    .catch(() => []);

  const today = new Date().toISOString().split("T")[0];

  const urls = [
    ...staticPages.map(p => `
  <url>
    <loc>${baseUrl}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
    ...posts.map(p => `
  <url>
    <loc>${baseUrl}/blog/${p.slug}</loc>
    <lastmod>${p.updatedAt instanceof Date ? p.updatedAt.toISOString().split("T")[0] : today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`),
  ].join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(xml);
});

// ── 管理者向け SEO設定 ────────────────────────────────────────────────────────

// GET /admin/seo — 全SEO設定を取得
router.get("/admin/seo", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "seo_%"));
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key.replace(/^seo_/, "")] = row.value;
  }
  res.json(result);
});

// POST /admin/seo — SEO設定を一括保存
router.post("/admin/seo", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    const dbKey = `seo_${key}`;
    await db.insert(settingsTable)
      .values({ key: dbKey, value: String(value), updatedAt: new Date() })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(value), updatedAt: new Date() } });
  }
  res.json({ ok: true });
});

// ── サイトマップ Ping（Google・Bing に送信） ──────────────────────────────────
router.post("/admin/seo/sitemap-ping", requireAdmin, async (_req, res): Promise<void> => {
  const siteUrlRow = await db.select().from(settingsTable)
    .where(eq(settingsTable.key, "seo_siteUrl")).limit(1).catch(() => []);
  const baseUrl = (siteUrlRow[0]?.value ?? process.env.SITE_URL ?? "https://chatlogi.jp").replace(/\/$/, "");
  const sitemapUrl = encodeURIComponent(`${baseUrl}/sitemap.xml`);

  const results: { engine: string; ok: boolean; status?: number; error?: string }[] = [];

  // Google
  try {
    const r = await fetch(`https://www.google.com/ping?sitemap=${sitemapUrl}`, { signal: AbortSignal.timeout(10_000) });
    results.push({ engine: "Google", ok: r.ok, status: r.status });
  } catch (e: any) {
    results.push({ engine: "Google", ok: false, error: e.message });
  }

  // Bing
  try {
    const r = await fetch(`https://www.bing.com/ping?sitemap=${sitemapUrl}`, { signal: AbortSignal.timeout(10_000) });
    results.push({ engine: "Bing", ok: r.ok, status: r.status });
  } catch (e: any) {
    results.push({ engine: "Bing", ok: false, error: e.message });
  }

  res.json({ sitemapUrl: decodeURIComponent(sitemapUrl), results });
});

export default router;
