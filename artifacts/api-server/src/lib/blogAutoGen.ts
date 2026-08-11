/**
 * ブログ自動生成スケジューラー
 * 毎朝9:00 (JST) に1記事生成して自動公開
 */
import cron from "node-cron";
import { db, blogPostsTable, settingsTable } from "@workspace/db";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { PROMPT_DEFAULTS } from "../routes/ai-settings";

async function getBlogSystemPrompt(targetType: string): Promise<string> {
  const key = targetType === "rental_company" ? "ai_blog_rental_prompt" : "ai_blog_user_prompt";
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
    return row?.value ?? PROMPT_DEFAULTS[key as keyof typeof PROMPT_DEFAULTS] ?? "";
  } catch {
    return PROMPT_DEFAULTS[key as keyof typeof PROMPT_DEFAULTS] ?? "";
  }
}

// ── ユーザー向けトピック（軽バン利用者） ──────────────────────────────────────
const USER_TOPICS = [
  { keyword: "軽バン レンタル 比較", painPoint: "どのサービスが自社に合うか分からない" },
  { keyword: "個人事業主 軽バン 月額", painPoint: "月々の費用を抑えて軽バンを使いたい" },
  { keyword: "軽バン サブスク メリット", painPoint: "購入とレンタルどちらが得か判断できない" },
  { keyword: "軽バン 短期 レンタル", painPoint: "1〜3ヶ月だけ軽バンが必要な場面がある" },
  { keyword: "軽バン 複数台 法人", painPoint: "複数台まとめて手配したいが手間がかかる" },
  { keyword: "軽バン 配送 個人事業主 節税", painPoint: "軽バン費用を経費計上したい" },
  { keyword: "軽バン ETCカード ドラレコ 標準装備", painPoint: "装備が揃った車両をすぐ使いたい" },
  { keyword: "軽バン 審査 個人事業主", painPoint: "フリーランスでも審査が通るか不安" },
  { keyword: "軽バン 保険 車検込み", painPoint: "保険・車検の手続きが面倒" },
  { keyword: "軽バン 最短翌日 レンタル", painPoint: "急ぎで軽バンが必要になった" },
  { keyword: "軽バン 積載量 用途別", painPoint: "荷物に合った車種の選び方が分からない" },
  { keyword: "軽バン チャット 相談", painPoint: "電話なしで軽バンを手配したい" },
  { keyword: "軽バン レンタル 解約 途中", painPoint: "急に不要になったときの解約条件が気になる" },
  { keyword: "軽バン 月額 固定費", painPoint: "固定費として軽バンを管理したい" },
  { keyword: "軽バン 配送業 開業", painPoint: "配送業を始めるための軽バン調達方法が分からない" },
  { keyword: "軽バン 福祉 移送", painPoint: "福祉用途の軽バンを手軽に使いたい" },
  { keyword: "軽バン 農業 運搬", painPoint: "農産物運搬用の軽バンをリーズナブルに使いたい" },
  { keyword: "軽バン フードデリバリー 副業", painPoint: "副業で配送を始めるための軽バンが必要" },
  { keyword: "軽バン 引越し 自分で", painPoint: "引越しで軽バンを自分で運転したい" },
  { keyword: "軽バン ECショップ 発送", painPoint: "EC発送業務で軽バンを活用したい" },
];

// ── レンタル会社向けトピック ───────────────────────────────────────────────────
const RENTAL_TOPICS = [
  { keyword: "軽バン 遊休車両 活用", painPoint: "駐車場に眠っている車両から収益を得たい" },
  { keyword: "レンタカー 稼働率 改善", painPoint: "車両稼働率が低く月次収益が安定しない" },
  { keyword: "軽バン リース 収益 安定化", painPoint: "月次売上の波が大きく収益予測が立てにくい" },
  { keyword: "レンタカー 法人契約 メリット", painPoint: "個人客よりも安定した法人契約を増やしたい" },
  { keyword: "軽バン 車両管理 コスト削減", painPoint: "整備・管理コストが利益を圧迫している" },
  { keyword: "カーシェア パートナー 収益", painPoint: "新しい収益源としてカーシェアを検討している" },
  { keyword: "レンタカー 顧客獲得 コスト", painPoint: "集客コストが高くROIが見えない" },
  { keyword: "軽バン サブスク パートナー", painPoint: "サブスクモデルで安定した収益を得たい" },
  { keyword: "車両提供 法人向け 契約", painPoint: "法人向けに安定した月額契約を結びたい" },
  { keyword: "レンタカー 繁忙期 対応策", painPoint: "繁忙期のみ売上が上がり閑散期は車両が遊ぶ" },
  { keyword: "軽バン フリート 運用", painPoint: "複数台の車両を効率よく運用したい" },
  { keyword: "レンタカー デジタル化 予約管理", painPoint: "電話・手書きでの予約管理に限界を感じている" },
  { keyword: "車両保有 コスト 見直し", painPoint: "保険・税金・整備費を最適化したい" },
  { keyword: "軽バン 月額提供 収益シミュレーション", painPoint: "月額いくらで提供すれば利益が出るか計算できない" },
  { keyword: "レンタカー 事業 規模拡大", painPoint: "事業を拡大したいが資金・人材が限られている" },
];

let scheduled = false;
let task: ReturnType<typeof cron.schedule> | null = null;

function settingKey(type: string, suffix: string): string {
  return type === "rental_company" ? `blog_auto_gen_rental_${suffix}` : `blog_auto_gen_${suffix}`;
}

async function isEnabled(type = "user"): Promise<boolean> {
  const key = settingKey(type, "enabled");
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return row?.value === "true";
}

export async function setEnabled(enabled: boolean, type = "user"): Promise<void> {
  const key = settingKey(type, "enabled");
  await db.insert(settingsTable)
    .values({ key, value: enabled ? "true" : "false", updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: enabled ? "true" : "false", updatedAt: new Date() } });
}

export async function getStatus(type = "user") {
  const [enabledRow]   = await db.select().from(settingsTable).where(eq(settingsTable.key, settingKey(type, "enabled"))).limit(1);
  const [lastRow]      = await db.select().from(settingsTable).where(eq(settingsTable.key, settingKey(type, "last_run"))).limit(1);
  const [lastTitleRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, settingKey(type, "last_title"))).limit(1);
  return {
    enabled: enabledRow?.value === "true",
    lastRun: lastRow?.value ?? null,
    lastTitle: lastTitleRow?.value ?? null,
    schedule: "毎朝 9:00 (JST)",
  };
}

export async function generateAndPublish(targetType = "user"): Promise<{ title: string; slug: string }> {
  const topics = targetType === "rental_company" ? RENTAL_TOPICS : USER_TOPICS;
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const topic = topics[dayOfYear % topics.length];

  logger.info({ keyword: topic.keyword, targetType }, "[BLOG AUTO-GEN] 生成開始");

  const isRental = targetType === "rental_company";

  const systemPrompt = await getBlogSystemPrompt(targetType);

  const readerDesc = isRental
    ? "レンタカー会社・リース会社の経営者・管理職"
    : "軽バンを利用したい法人担当者・個人事業主・配送業者";

  const ctaDesc = isRental
    ? "Chat VANへの車両提供・パートナー登録のCTA（「まずは無料でお問い合わせください」）"
    : "Chat VANで軽バンを探すCTA（「まずは無料でご相談ください」）";

  const categoryList = isRental
    ? "稼働率改善/収益アップ/コスト管理/運営効率化/パートナー活用"
    : "軽バン活用術/節約・コスト/レンタル基礎知識/個人事業主向け/法人向け/Chat VANコラム";

  const userPrompt = [
    `以下の条件でSEO記事を作成してください。`,
    ``,
    `メインキーワード: ${topic.keyword}`,
    `ターゲットの悩み: ${topic.painPoint}`,
    ``,
    `要件:`,
    `- 文字数: 1200〜1800文字`,
    `- 読者: ${readerDesc}`,
    `- 構成: ペインを強調→原因分析→解決策提示→Chat VANのCTA`,
    `- H2/H3を使った見出し構造（Markdownで記述）`,
    `- 末尾に${ctaDesc}`,
    ``,
    `出力形式はJSONのみ:`,
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
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const data = JSON.parse(cleaned);

  if (!data.title || !data.slug || !data.content) {
    throw new Error("AI生成結果が不完全です");
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const slug = `${data.slug}-${dateStr}`;

  await db.execute(drizzleSql`
    INSERT INTO blog_posts (slug, title, excerpt, content, category, tags, meta_title, meta_description, published, published_at, target_type)
    VALUES (
      ${slug}, ${data.title}, ${data.excerpt ?? ""}, ${data.content},
      ${data.category ?? (isRental ? "稼働率改善" : "Chat VANコラム")},
      ${data.tags ? JSON.stringify(data.tags) : null},
      ${data.metaTitle ?? null}, ${data.metaDescription ?? null},
      true, ${new Date()}, ${targetType}
    )
  `);

  const now = new Date().toISOString();
  for (const [suffix, value] of [["last_run", now], ["last_title", data.title]] as [string, string][]) {
    const key = settingKey(targetType, suffix);
    await db.insert(settingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
  }

  logger.info({ title: data.title, slug, targetType }, "[BLOG AUTO-GEN] 公開完了");
  return { title: data.title, slug };
}

export function startScheduler(): void {
  if (scheduled) return;
  scheduled = true;

  // 毎朝9:00 JST → UTC 0:00
  task = cron.schedule("0 0 * * *", async () => {
    // ユーザー向け自動生成
    try {
      if (await isEnabled("user")) {
        await generateAndPublish("user");
      } else {
        logger.info("[BLOG AUTO-GEN] ユーザー向け：無効のためスキップ");
      }
    } catch (e: any) {
      logger.error({ err: e.message }, "[BLOG AUTO-GEN] ユーザー向けエラー");
    }
    // レンタル会社向け自動生成
    try {
      if (await isEnabled("rental_company")) {
        await generateAndPublish("rental_company");
      } else {
        logger.info("[BLOG AUTO-GEN] レンタル会社向け：無効のためスキップ");
      }
    } catch (e: any) {
      logger.error({ err: e.message }, "[BLOG AUTO-GEN] レンタル会社向けエラー");
    }
  }, { timezone: "Asia/Tokyo" });

  logger.info("[BLOG AUTO-GEN] スケジューラー起動 (毎朝9:00 JST)");
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
  scheduled = false;
}
