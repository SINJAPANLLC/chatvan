/**
 * ブログ自動生成スケジューラー
 * 毎朝9:00 (JST) に1記事生成して自動公開
 */
import cron from "node-cron";
import { db, blogPostsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

// 30日分のキーワードローテーション（日付のmod30で選択）
const TOPICS = [
  { keyword: "運送会社の選び方", painPoint: "どの運送会社が自社に合うか分からない" },
  { keyword: "物流コスト削減", painPoint: "配送費が年々上がって利益を圧迫している" },
  { keyword: "ラストマイル配送", painPoint: "宅配の遅延・不在でクレームが増えている" },
  { keyword: "物流DXとは", painPoint: "いまだにFAXや電話で運送手配していて非効率" },
  { keyword: "チャーター便と路線便の違い", painPoint: "どちらを使えばいいか判断できない" },
  { keyword: "3PL物流代行", painPoint: "自社で物流管理する余裕がない" },
  { keyword: "フレート管理", painPoint: "輸送コストの見える化ができていない" },
  { keyword: "混載便の活用法", painPoint: "小ロット輸送のコストが高すぎる" },
  { keyword: "緊急配送の手配方法", painPoint: "急な配送依頼に対応できる業者が見つからない" },
  { keyword: "物流アウトソーシング", painPoint: "物流業務に人手と時間が取られすぎている" },
  { keyword: "配送状況のリアルタイム把握", painPoint: "荷物がどこにあるか分からないと顧客から苦情が来る" },
  { keyword: "運賃交渉のコツ", painPoint: "運送会社との価格交渉で損をしている気がする" },
  { keyword: "物流における温度管理", painPoint: "食品・医薬品の温度管理輸送が難しい" },
  { keyword: "返品物流（リバースロジスティクス）", painPoint: "返品対応が煩雑でコストがかさんでいる" },
  { keyword: "物流業界の2024年問題", painPoint: "ドライバー不足で配送が遅れるようになった" },
  { keyword: "倉庫保管と配送の連携", painPoint: "倉庫と配送会社の連携がうまくいかない" },
  { keyword: "BtoB配送の効率化", painPoint: "法人向け配送の管理が煩雑すぎる" },
  { keyword: "物流における書類管理", painPoint: "納品書・送り状の管理がアナログで大変" },
  { keyword: "ドライバー不足への対応策", painPoint: "配送を頼めるドライバーが見つからない" },
  { keyword: "物流コンサルティング活用法", painPoint: "物流改善の方向性が分からない" },
  { keyword: "中小企業の物流戦略", painPoint: "大手と違い物流に予算をかけられない" },
  { keyword: "EC物流の課題と解決策", painPoint: "ネット販売拡大に伴い配送が追いつかない" },
  { keyword: "季節変動に強い物流体制", painPoint: "繁忙期に配送能力が足りなくなる" },
  { keyword: "物流における環境対応", painPoint: "CO2削減など環境への取り組みが求められている" },
  { keyword: "建設資材の輸送手配", painPoint: "大型資材の輸送手配が難しい" },
  { keyword: "製造業の物流改善", painPoint: "工場出荷から納品までの流れが非効率" },
  { keyword: "食品物流の注意点", painPoint: "食品の鮮度を保ちながら配送する方法が分からない" },
  { keyword: "物流コスト見積もりの取り方", painPoint: "複数社から見積もりを取る手間が大きい" },
  { keyword: "引越し・移転時の物流手配", painPoint: "オフィス移転時の物品輸送手配が分からない" },
  { keyword: "スポット輸送と定期輸送の使い分け", painPoint: "いつスポットで頼んでいつ定期契約すべきか分からない" },
];

let scheduled = false;
let task: ReturnType<typeof cron.schedule> | null = null;

async function isEnabled(): Promise<boolean> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "blog_auto_gen_enabled")).limit(1);
  return row?.value === "true";
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await db.insert(settingsTable)
    .values({ key: "blog_auto_gen_enabled", value: enabled ? "true" : "false", updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: enabled ? "true" : "false", updatedAt: new Date() } });
}

export async function getStatus() {
  const [enabledRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, "blog_auto_gen_enabled")).limit(1);
  const [lastRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, "blog_auto_gen_last_run")).limit(1);
  const [lastTitleRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, "blog_auto_gen_last_title")).limit(1);
  return {
    enabled: enabledRow?.value === "true",
    lastRun: lastRow?.value ?? null,
    lastTitle: lastTitleRow?.value ?? null,
    schedule: "毎朝 9:00 (JST)",
  };
}

export async function generateAndPublish(): Promise<{ title: string; slug: string }> {
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const topic = TOPICS[dayOfYear % TOPICS.length];

  logger.info({ keyword: topic.keyword }, "[BLOG AUTO-GEN] 生成開始");

  const systemPrompt = "あなたは物流業界に特化したSEOコンテンツライターです。日本語の物流担当者・経営者に向けた、検索意図に沿った実用的なブログ記事を作成します。";
  const userPrompt = [
    `以下の条件でSEO記事を作成してください。`,
    ``,
    `メインキーワード: ${topic.keyword}`,
    `ターゲットの悩み: ${topic.painPoint}`,
    ``,
    `要件:`,
    `- 文字数: 1200〜1800文字`,
    `- 読者: 物流担当者・中小企業の経営者`,
    `- 構成: ペインを強調→原因分析→解決策提示→Chat LOGIのCTA`,
    `- H2/H3を使った見出し構造（Markdownで記述）`,
    `- 末尾にChat LOGIへの誘導CTA（「まずは無料でご相談ください」）`,
    ``,
    `出力形式はJSONのみ:`,
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
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const data = JSON.parse(cleaned);

  if (!data.title || !data.slug || !data.content) {
    throw new Error("AI生成結果が不完全です");
  }

  // slugの重複回避：末尾に日付を付与
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const slug = `${data.slug}-${dateStr}`;

  const [post] = await db.insert(blogPostsTable).values({
    slug,
    title: data.title,
    excerpt: data.excerpt ?? "",
    content: data.content,
    category: data.category ?? "物流コラム",
    tags: data.tags ? JSON.stringify(data.tags) : null,
    metaTitle: data.metaTitle ?? null,
    metaDescription: data.metaDescription ?? null,
    published: true,
    publishedAt: new Date(),
  }).returning();

  // 最終実行日時とタイトルを保存
  const now = new Date().toISOString();
  await db.insert(settingsTable)
    .values({ key: "blog_auto_gen_last_run", value: now, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: now, updatedAt: new Date() } });
  await db.insert(settingsTable)
    .values({ key: "blog_auto_gen_last_title", value: data.title, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: data.title, updatedAt: new Date() } });

  logger.info({ title: post.title, slug: post.slug }, "[BLOG AUTO-GEN] 公開完了");
  return { title: post.title, slug: post.slug };
}

export function startScheduler(): void {
  if (scheduled) return;
  scheduled = true;

  // 毎朝9:00 JST (UTC+9 → UTC 0:00)
  task = cron.schedule("0 0 * * *", async () => {
    try {
      const enabled = await isEnabled();
      if (!enabled) {
        logger.info("[BLOG AUTO-GEN] 無効のためスキップ");
        return;
      }
      await generateAndPublish();
    } catch (e: any) {
      logger.error({ err: e.message }, "[BLOG AUTO-GEN] エラー");
    }
  }, { timezone: "Asia/Tokyo" });

  logger.info("[BLOG AUTO-GEN] スケジューラー起動 (毎朝9:00 JST)");
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
  scheduled = false;
}
