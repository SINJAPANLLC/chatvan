/**
 * 自動リスト収集 & 営業メール送信
 * - DuckDuckGo HTML から荷主候補を収集
 * - AI で品質スコアリング & 個別メール文生成
 * - 毎日5件取得 → 5件未送信に送信
 */
import cron from "node-cron";
import { db, prospectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendEmail, buildSalesEmailHtml } from "./email";
import { logger } from "./logger";

// ── ローテーション候補 ──────────────────────────────────────────────────────────
const INDUSTRIES = [
  "食品メーカー", "製造業", "化学品メーカー", "医薬品", "電子部品メーカー",
  "アパレル", "家具メーカー", "建材メーカー", "農産物", "EC通販事業者",
  "小売業", "卸売業", "自動車部品メーカー", "印刷業", "化粧品メーカー",
];
const PREFECTURES = [
  "東京都", "神奈川県", "大阪府", "愛知県", "埼玉県",
  "千葉県", "兵庫県", "福岡県", "静岡県", "茨城県",
  "栃木県", "群馬県", "岐阜県", "三重県", "広島県",
];
const SEARCH_QUERIES_TMPL = (industry: string, pref: string) => [
  `${industry} ${pref} 問い合わせ メール site:co.jp`,
  `${industry} 荷主 配送 発送 問い合わせ ${pref}`,
  `${pref} ${industry} メーカー 物流 お問い合わせ`,
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

// ── Brave Search API（VPS IPのDDG CAPTCHAブロックを回避） ────────────────────
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
  try {
    return await searchBrave(query);
  } catch (e: any) {
    // Brave APIキー未設定やエラー時は空配列（ログはメイン処理で記録）
    throw e;
  }
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

    // サブページも確認
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

// ── AI: 荷主適合度評価 ────────────────────────────────────────────────────────
async function aiScore(
  candidates: { idx: number; url: string; title: string }[],
  industry: string,
): Promise<{ idx: number; companyName: string; industry: string }[]> {
  if (candidates.length === 0) return [];

  const prompt = `あなたは物流SaaS「Chat LOGI」のBtoB営業AIです。
以下の企業リストの中から「荷主企業」として有望なものを最大5社選び、JSONのみで返してください。

Chat LOGIのサービス: チャットで配送依頼するだけでプロが即日手配する物流SaaS。
理想の顧客: 定期的な発送ニーズがある法人（製造、食品、EC、小売、卸売など）。

企業リスト:
${JSON.stringify(candidates.map(c => ({ idx: c.idx, url: c.url, title: c.title })))}

除外条件:
- 個人ブログ・メディア・求人・官公庁・金融・不動産は除外
- 明らかに荷主でないもの（SaaS、IT、コンサル等）は低スコア

出力（JSONのみ、他の文字は不要）:
[{"idx":0,"companyName":"株式会社○○","industry":"${industry}"}]`;

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
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: `Chat LOGI（物流SaaS）の営業メールを1通生成してください。

宛先企業: ${companyName}（業種: ${industry}）
サービス概要: チャットで配送依頼するだけで、物流のプロが最短即日手配。運送会社との交渉・見積依頼が不要になる。

条件:
- 件名: 30文字以内、【Chat LOGI】で始める
- 本文: 180〜280文字。丁寧で簡潔、押しつけがましくない
- {会社名} プレースホルダーを冒頭宛名として使う
- 配送コスト・手間削減の具体的ベネフィットに1行触れる

出力（JSONのみ）:
{"subject":"件名","body":"本文"}`,
        },
      ],
      max_completion_tokens: 400,
    });
    const raw = (res.choices[0]?.message?.content ?? "{}")
      .replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(raw);
  } catch {
    return {
      subject: "【Chat LOGI】物流業務を自動化するご提案",
      body:
        "{会社名} ご担当者様\n\nはじめまして。物流SaaS「Chat LOGI」と申します。\n\nチャットで配送依頼するだけで物流のプロが即日手配いたします。\n運送会社との見積・交渉が不要になり、物流業務のコストと手間を大幅に削減できます。\n\nまずは無料でお試しいただけます。ぜひご検討ください。",
    };
  }
}

// ── メイン処理 ────────────────────────────────────────────────────────────────
export async function runAutoProspect(): Promise<AutoProspectLog> {
  const ranAt = new Date().toISOString();
  const errors: string[] = [];

  // 日付ベースでローテーション
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const industry = INDUSTRIES[dayIdx % INDUSTRIES.length];
  const prefecture = PREFECTURES[dayIdx % PREFECTURES.length];

  logger.info({ industry, prefecture }, "[AutoProspect] 開始");

  // ── 1. DDG クロール ────────────────────────────────────────────────────────
  const queries = SEARCH_QUERIES_TMPL(industry, prefecture);
  const allUrls: string[] = [];

  for (const q of queries) {
    try {
      const urls = await searchWeb(q);
      allUrls.push(...urls);
      await new Promise(r => setTimeout(r, 1_000)); // rate limit
    } catch (e: any) {
      errors.push(`検索エラー: ${e.message}`);
    }
  }

  const uniqueUrls = [...new Set(allUrls)].slice(0, 20);
  logger.info({ count: uniqueUrls.length }, "[AutoProspect] URL収集完了");

  // ── 2. 各サイトからメール抽出 ──────────────────────────────────────────────
  const candidates: { idx: number; url: string; title: string; email: string }[] = [];

  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    try {
      const { email, title } = await findEmailOnSite(url);
      if (email && title) {
        candidates.push({ idx: candidates.length, url, title, email });
      }
      await new Promise(r => setTimeout(r, 500));
    } catch { /* skip */ }
  }

  logger.info({ count: candidates.length }, "[AutoProspect] メール抽出完了");

  if (candidates.length === 0) {
    errors.push("候補サイトからメールアドレスを取得できませんでした");
    // クロール失敗でも既存の未送信リストへの送信は続行する
  }

  // ── 3. AI でスコアリング ──────────────────────────────────────────────────
  const scored = await aiScore(
    candidates.map(c => ({ idx: c.idx, url: c.url, title: c.title })),
    industry,
  );

  // ── 4. DB 登録（重複スキップ、最大5件） ───────────────────────────────────
  let found = 0;
  const insertedEmails = new Set<string>();

  for (const s of scored.slice(0, 5)) {
    const c = candidates[s.idx];
    if (!c) continue;
    if (insertedEmails.has(c.email)) continue;

    // 既存チェック
    const existing = await db
      .select()
      .from(prospectsTable)
      .where(eq(prospectsTable.email, c.email))
      .limit(1);
    if (existing.length > 0) continue;

    try {
      await db.insert(prospectsTable).values({
        companyName: s.companyName || c.title,
        email: c.email,
        industry: s.industry || industry,
        prefecture,
        notes: `[自動取得] ${c.url}`,
        status: "unsent",
      });
      insertedEmails.add(c.email);
      found++;
    } catch (e: any) {
      errors.push(`DB挿入エラー: ${e.message}`);
    }
  }

  logger.info({ found }, "[AutoProspect] DB登録完了");

  // ── 5. 未送信 5件にメール送信 ─────────────────────────────────────────────
  const unsent = await db
    .select()
    .from(prospectsTable)
    .where(eq(prospectsTable.status, "unsent"))
    .limit(5);

  let sent = 0;
  for (const prospect of unsent) {
    try {
      const { subject, body } = await aiGenerateEmail(
        prospect.companyName,
        prospect.industry ?? industry,
      );
      const html = buildSalesEmailHtml({
        subject,
        bodyText: body,
        companyName: prospect.companyName,
        contactName: prospect.contactName ?? undefined,
        ctaText: "Chat LOGIを無料で試す →",
        ctaUrl: "https://chatlogi.jp",
      });
      const result = await sendEmail(prospect.email, subject, html);
      if (result.sent) {
        await db
          .update(prospectsTable)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(prospectsTable.id, prospect.id));
        sent++;
      } else {
        errors.push(`送信失敗 ${prospect.email}: ${result.reason}`);
      }
    } catch (e: any) {
      errors.push(`メール処理エラー: ${e.message}`);
    }
  }

  logger.info({ sent }, "[AutoProspect] 送信完了");

  lastRunLog = { ranAt, industry, prefecture, found, sent, errors };
  return lastRunLog;
}

// ── スケジューラー起動 ────────────────────────────────────────────────────────
export function startAutoProspect() {
  // 毎朝 09:00 JST = UTC 00:00
  cron.schedule("0 0 * * *", async () => {
    logger.info("[AutoProspect] 定期実行開始");
    try {
      await runAutoProspect();
    } catch (e: any) {
      logger.error({ err: e.message }, "[AutoProspect] 予期せぬエラー");
    }
  });
  logger.info("[AutoProspect] スケジューラー起動（毎日 UTC 00:00 / JST 09:00）");
}
