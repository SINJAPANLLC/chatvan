/**
 * 自動リスト収集 & 営業メール送信
 * - Brave Search から軽バンレンタル会社候補を収集
 * - AI で品質スコアリング & 個別メール文生成
 * - 毎日5件取得 → 5件未送信に送信
 */
import cron from "node-cron";
import { db, prospectsTable, settingsTable } from "@workspace/db";
import { and, eq, sql as drizzleSql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { PROMPT_DEFAULTS } from "../routes/ai-settings";
import { sendProspectOutreach } from "./outreachSender";

// ── ローテーション候補 ──────────────────────────────────────────────────────────
const INDUSTRIES = [
  "レンタカー会社", "カーリース会社", "自動車販売会社", "中古車販売", "軽バン保有会社",
  "運送会社", "引越し会社", "福祉車両レンタル", "建設機械レンタル", "農業機械レンタル",
  "軽貨物配送会社", "宅配事業者", "フードデリバリー", "EC配送業者", "輸送会社",
];
const PREFECTURES = [
  "東京都", "神奈川県", "大阪府", "愛知県", "埼玉県",
  "千葉県", "兵庫県", "福岡県", "静岡県", "茨城県",
  "栃木県", "群馬県", "岐阜県", "三重県", "広島県",
];
const SEARCH_QUERIES_TMPL = (industry: string, pref: string) => [
  `${industry} ${pref} 問い合わせ メール site:co.jp`,
  `${industry} 軽バン 保有 ${pref} お問い合わせ`,
  `${pref} ${industry} レンタル 問い合わせ`,
];

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const SKIP_DOMAINS = ["example", "sample", "sentry", "schema.org", "w3.org", "google", "mailto:?", "test.", "dummy"];

// ── 直近の実行ログ（メモリ、再起動でリセット） ────────────────────────────────
export interface AutoProspectLog {
  ranAt: string;
  industry: string;
  prefecture: string;
  found: number;
  sent: number;
  errors: string[];
}
export let lastRunLog: AutoProspectLog | null = null;

// ── DBからプロンプトを取得（なければデフォルト） ──────────────────────────────
async function getPrompt(key: "ai_prospect_score_prompt" | "ai_prospect_email_prompt"): Promise<string> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
    return row?.value ?? PROMPT_DEFAULTS[key];
  } catch {
    return PROMPT_DEFAULTS[key];
  }
}

// ── HTTP fetch ────────────────────────────────────────────────────────────────
async function fetchHtml(url: string, timeout = 10_000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── Brave Search API ───────────────────────────────────────────────────────────
async function searchBrave(query: string): Promise<string[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY が未設定です");

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=JP&search_lang=ja&count=20&result_filter=web`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Brave API エラー: HTTP ${res.status}`);

  const data = await res.json() as any;
  const results: any[] = data?.web?.results ?? [];
  return results
    .map((r: any) => r.url as string)
    .filter(u => u && u.startsWith("http"))
    .sort((a, b) => (b.includes(".co.jp") ? 1 : 0) - (a.includes(".co.jp") ? 1 : 0))
    .slice(0, 12);
}

async function searchWeb(query: string): Promise<string[]> {
  return await searchBrave(query);
}

// ── サイトからメールを抽出 ───────────────────────────────────────────────────
function extractEmails(html: string): string[] {
  const all = html.match(EMAIL_RE) ?? [];
  return [...new Set(all)].filter(
    e =>
      !SKIP_DOMAINS.some(d => e.includes(d)) &&
      !e.endsWith(".png") &&
      !e.endsWith(".jpg") &&
      !e.endsWith(".gif") &&
      e.includes("@"),
  );
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]{2,80})<\/title>/i);
  return (m?.[1] ?? "")
    .trim()
    .replace(/\s*[\|｜－\-–—]\s*.+$/, "")
    .trim();
}

async function findEmailOnSite(
  siteUrl: string,
): Promise<{ email: string | null; title: string }> {
  try {
    const html = await fetchHtml(siteUrl, 8_000);
    const title = extractTitle(html);
    const emails = extractEmails(html);
    if (emails.length) return { email: emails[0], title };

    const origin = new URL(siteUrl).origin;
    for (const path of ["/contact", "/inquiry", "/company", "/about"]) {
      try {
        const sub = await fetchHtml(origin + path, 6_000);
        const se = extractEmails(sub);
        if (se.length) return { email: se[0], title };
      } catch { /* skip */ }
    }
    return { email: null, title };
  } catch {
    return { email: null, title: "" };
  }
}

// ── AI: 企業スコアリング ──────────────────────────────────────────────────────
async function aiScore(
  candidates: { idx: number; url: string; title: string }[],
  industry: string,
): Promise<{ idx: number; companyName: string; industry: string }[]> {
  if (candidates.length === 0) return [];

  const template = await getPrompt("ai_prospect_score_prompt");
  const prompt = template
    .replace("{CANDIDATES}", JSON.stringify(candidates.map(c => ({ idx: c.idx, url: c.url, title: c.title }))))
    .replace(/\{INDUSTRY\}/g, industry);

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 800,
    });
    const raw = (res.choices[0]?.message?.content ?? "[]")
      .replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── AI: 個別営業メール生成 ───────────────────────────────────────────────────
async function aiGenerateEmail(
  companyName: string,
  industry: string,
): Promise<{ subject: string; body: string }> {
  try {
    const template = await getPrompt("ai_prospect_email_prompt");
    const prompt = template
      .replace("{COMPANY_NAME}", companyName)
      .replace(/\{INDUSTRY\}/g, industry);

    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 400,
    });
    const raw = (res.choices[0]?.message?.content ?? "{}")
      .replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(raw);
  } catch {
    return {
      subject: "【Chat VAN】車両提供のご相談",
      body: "{会社名} ご担当者様\n\nはじめまして。軽バンレンタルサービス「Chat VAN」と申します。\n\n遊休車両を活用し、安定した月額収益を得られる仕組みをご提案させてください。\n顧客対応はChat VAN側が担当するため、御社の手間を最小化できます。\n\nまずは無料でご相談ください。",
    };
  }
}

// ── メイン処理 ────────────────────────────────────────────────────────────────
export async function runAutoProspect(): Promise<AutoProspectLog> {
  const ranAt = new Date().toISOString();
  const errors: string[] = [];

  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const industry = INDUSTRIES[dayOfYear % INDUSTRIES.length];
  const prefecture = PREFECTURES[dayOfYear % PREFECTURES.length];

  logger.info({ industry, prefecture }, "[AutoProspect] 開始");

  let found = 0;

  // ── Step 1: 検索 → メール収集 ──────────────────────────────────────────────
  const queries = SEARCH_QUERIES_TMPL(industry, prefecture);
  const allUrls: string[] = [];

  for (const q of queries) {
    try {
      const urls = await searchWeb(q);
      allUrls.push(...urls);
    } catch (e: any) {
      errors.push(`検索失敗: ${e.message}`);
    }
  }

  const uniqueUrls = [...new Set(allUrls)].slice(0, 20);
  const rawCandidates: { idx: number; url: string; title: string; email: string }[] = [];

  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    try {
      const { email, title } = await findEmailOnSite(url);
      if (email) rawCandidates.push({ idx: i, url, title, email });
    } catch (e: any) {
      errors.push(`サイト取得失敗 ${url}: ${e.message}`);
    }
  }

  // ── Step 2: AIスコアリング ──────────────────────────────────────────────────
  const scored = await aiScore(rawCandidates, industry);

  // ── Step 3: DBに登録 ───────────────────────────────────────────────────────
  for (const s of scored) {
    const raw = rawCandidates.find(c => c.idx === s.idx);
    if (!raw) continue;

    // 重複チェック
    const existing = await db.select({ id: prospectsTable.id })
      .from(prospectsTable)
      .where(eq(prospectsTable.email, raw.email))
      .limit(1);
    if (existing.length > 0) continue;

    try {
      await db.insert(prospectsTable).values({
        companyName: s.companyName || raw.title || raw.url,
        email: raw.email,
        industry: s.industry || industry,
        prefecture,
        notes: `[自動取得] ${raw.url}`,
        status: "unsent",
      });
      found++;
    } catch (e: any) {
      errors.push(`DB登録失敗 ${raw.email}: ${e.message}`);
    }
  }

  // ── Step 4: 未送信5件にAI個別メールを送信 ─────────────────────────────────
  let sent = 0;
  const targets = await db.select()
    .from(prospectsTable)
    .where(and(
      eq(prospectsTable.status, "unsent"),
      drizzleSql`${prospectsTable}.prospect_type = 'user'`,
    ))
    .limit(5);

  for (const t of targets) {
    try {
      const { subject, body } = await aiGenerateEmail(t.companyName, t.industry ?? industry);
      const result = await sendProspectOutreach({
        prospectId: t.id,
        prospectType: "user",
        subject,
        bodyText: body,
        ctaText: "Chat VANの詳細を見る →",
      });
      if (result.sent) {
        sent++;
      } else if (!result.reason?.includes("スキップ")) {
        errors.push(`送信失敗 ${t.email}: ${result.reason}`);
      }
    } catch (e: any) {
      errors.push(`メール生成失敗 ${t.companyName}: ${e.message}`);
    }
  }

  lastRunLog = { ranAt, industry, prefecture, found, sent, errors };
  logger.info({ found, sent, errors: errors.length }, "[AutoProspect] 完了");
  return lastRunLog;
}

// ── スケジューラー ────────────────────────────────────────────────────────────
let scheduled = false;
let task: ReturnType<typeof cron.schedule> | null = null;

export function startScheduler(): void {
  if (scheduled) return;
  scheduled = true;
  task = cron.schedule("0 0 * * *", async () => {
    try { await runAutoProspect(); }
    catch (e: any) { logger.error({ err: e.message }, "[AutoProspect] エラー"); }
  }, { timezone: "Asia/Tokyo" });
  logger.info("[AutoProspect] スケジューラー起動（毎日 UTC 00:00 / JST 09:00）");
}

export function stopScheduler(): void {
  task?.stop(); task = null; scheduled = false;
}
