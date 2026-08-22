import { Router, type IRouter, type Request, type Response } from "express";
import { db, settingsTable } from "@workspace/db";
import { blogPostsTable } from "@workspace/db";
import { like, eq, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { logAdminAudit } from "../lib/auditLogger";

const router: IRouter = Router();
export const publicSeoRouter: IRouter = Router();

const DEFAULT_SEO = {
  title: "Chat VAN — 軽バンレンタル相談サービス",
  description: "チャットで条件を伝えるだけ。あなたに合った軽バンをご提案します。",
  keywords: "軽バン レンタル, 軽バン 月額, 軽貨物 レンタル",
  ogTitle: "Chat VAN — 軽バンレンタル相談サービス",
  ogDescription: "チャットで条件を伝えるだけ。あなたに合った軽バンをご提案します。",
  ogImage: "",
  gaTag: "",
  gscCode: "",
  robotsTxt: "",
  siteUrl: "",
} as const;

const SEO_LIMITS: Record<keyof typeof DEFAULT_SEO, number> = {
  title: 120,
  description: 320,
  keywords: 600,
  ogTitle: 120,
  ogDescription: 320,
  ogImage: 2_048,
  gaTag: 64,
  gscCode: 320,
  robotsTxt: 10_000,
  siteUrl: 2_048,
};

type SeoValues = Record<keyof typeof DEFAULT_SEO, string>;
const SEO_KEYS = new Set<keyof typeof DEFAULT_SEO>(Object.keys(DEFAULT_SEO) as (keyof typeof DEFAULT_SEO)[]);

function normalizeSiteUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, char => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[char] as string));
}

async function getSeoValues(): Promise<SeoValues> {
  const rows = await db.select().from(settingsTable)
    .where(like(settingsTable.key, "seo_%"))
    .catch(() => []);
  const values: SeoValues = { ...DEFAULT_SEO };
  for (const row of rows) {
    const key = row.key.replace(/^seo_/, "") as keyof typeof DEFAULT_SEO;
    if (SEO_KEYS.has(key)) values[key] = row.value;
  }
  return values;
}

function publicBaseUrl(values: SeoValues): string {
  return normalizeSiteUrl(values.siteUrl)
    ?? normalizeSiteUrl(process.env.SITE_URL)
    ?? "https://chatlogi.jp";
}

function buildRobots(values: SeoValues, baseUrl: string): string {
  const supplied = values.robotsTxt.trim();
  const lines = supplied ? supplied.split(/\r?\n/) : ["User-agent: *", "Allow: /"];
  if (!lines.some(line => /^sitemap\s*:/i.test(line.trim()))) {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push(`Sitemap: ${baseUrl}/sitemap.xml`);
  }
  return `${lines.join("\n").trim()}\n`;
}

function validateSeoPayload(body: unknown): Partial<SeoValues> | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "設定内容が不正です" };
  const result: Partial<SeoValues> = {};
  for (const [rawKey, rawValue] of Object.entries(body as Record<string, unknown>)) {
    if (!SEO_KEYS.has(rawKey as keyof typeof DEFAULT_SEO)) return { error: `許可されていない設定項目です: ${rawKey}` };
    if (typeof rawValue !== "string") return { error: `${rawKey} は文字列で入力してください` };
    const key = rawKey as keyof typeof DEFAULT_SEO;
    const value = rawValue.trim();
    if (value.length > SEO_LIMITS[key]) return { error: `${rawKey} は${SEO_LIMITS[key].toLocaleString()}文字以内にしてください` };
    if ((key === "siteUrl" || key === "ogImage") && value && !normalizeSiteUrl(value)) {
      return { error: `${rawKey} はhttp:// または https:// で始まる有効なURLにしてください` };
    }
    if (key === "gaTag" && value && !/^G-[A-Z0-9-]{4,}$/i.test(value)) {
      return { error: "Google Analyticsタグは G- から始まる測定IDを入力してください" };
    }
    if (key === "robotsTxt" && /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
      return { error: "robots.txt に使用できない文字が含まれています" };
    }
    result[key] = value;
  }
  return result;
}

// ── 公開SEO出力（サイト直下および /api 配下の両方で提供） ───────────────────
publicSeoRouter.get("/public/seo", async (_req: Request, res: Response): Promise<void> => {
  const values = await getSeoValues();
  res.set("Cache-Control", "public, max-age=300");
  res.json({ ...values, siteUrl: publicBaseUrl(values) });
});

publicSeoRouter.get("/sitemap.xml", async (_req: Request, res: Response): Promise<void> => {
  const values = await getSeoValues();
  const baseUrl = publicBaseUrl(values);

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
    .where(and(eq(blogPostsTable.published, true), eq(blogPostsTable.targetType, "user")))
    .catch(() => []);

  const today = new Date().toISOString().split("T")[0];

  const urls = [
    ...staticPages.map(p => `
  <url>
    <loc>${escapeXml(`${baseUrl}${p.path}`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
    ...posts.filter(p => Boolean(p.slug)).map(p => `
  <url>
    <loc>${escapeXml(`${baseUrl}/blog/${p.slug}`)}</loc>
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

publicSeoRouter.get("/robots.txt", async (_req: Request, res: Response): Promise<void> => {
  const values = await getSeoValues();
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300");
  res.send(buildRobots(values, publicBaseUrl(values)));
});

router.use(publicSeoRouter);

// ── 管理者向け SEO設定 ────────────────────────────────────────────────────────

// GET /admin/seo — 全SEO設定を取得
router.get("/admin/seo", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const values = await getSeoValues();
    res.json(values);
  } catch (error) {
    console.error("get seo settings error:", error);
    res.status(500).json({ error: "SEO設定の取得に失敗しました" });
  }
});

// POST /admin/seo — SEO設定を一括保存
router.post("/admin/seo", requireAdmin, async (req, res): Promise<void> => {
  const validated = validateSeoPayload(req.body);
  if ("error" in validated) {
    res.status(400).json(validated);
    return;
  }
  try {
    for (const [key, value] of Object.entries(validated)) {
      await db.insert(settingsTable)
        .values({ key: `seo_${key}`, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
    }
    await logAdminAudit(req, { action: "update", targetType: "seo_settings", targetId: "global", afterData: { fields: Object.keys(validated) } });
    res.json({ ok: true });
  } catch (error) {
    console.error("save seo settings error:", error);
    res.status(500).json({ error: "SEO設定の保存に失敗しました" });
  }
});

// ── サイトマップ Ping（Google・Bing に送信） ──────────────────────────────────
router.post("/admin/seo/sitemap-ping", requireAdmin, async (req, res): Promise<void> => {
  const values = await getSeoValues();
  const baseUrl = publicBaseUrl(values);
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

  await logAdminAudit(req, { action: "request", targetType: "sitemap_ping", targetId: "global", afterData: { results } });
  res.json({ sitemapUrl: decodeURIComponent(sitemapUrl), results });
});

export default router;
