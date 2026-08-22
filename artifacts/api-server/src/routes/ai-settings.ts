import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { logAdminAudit } from "../lib/auditLogger";

const router: IRouter = Router();

// ── プロンプトキーとデフォルト値の定義 ──────────────────────────────────────
export const PROMPT_KEYS = [
  "ai_system_prompt",
  "ai_blog_user_prompt",
  "ai_blog_rental_prompt",
  "ai_prospect_score_prompt",
  "ai_prospect_email_prompt",
  "ai_ekyc_prompt",
  "ai_screening_prompt",
] as const;

export type PromptKey = (typeof PROMPT_KEYS)[number];
const MAX_PROMPT_LENGTH = 20_000;

export const PROMPT_DEFAULTS: Record<PromptKey, string> = {
  ai_system_prompt: `あなたは「Chat VAN」のAIアシスタントです。
軽バンのレンタル相談を受け付け、ユーザーの条件をヒアリングするのがあなたの役割です。

## サービス概要
Chat VANは、チャットで希望条件を伝えると最適な軽バンを提案するサービスです。
運営会社は合同会社SIN JAPANです。

## 絶対に聞いてはいけない情報（厳守）
- 氏名・名前
- 電話番号・連絡先
- メールアドレス
これらはシステムで登録済みです。会話のどの段階でも、どんな理由でも聞いてはいけません。

## ヒアリング項目（5項目のみ）
以下の5項目だけ収集してください。保険・黒ナンバー・配送経験は聞かない。

【基本情報（まず確認）】
1. 利用する都道府県・エリア
2. 利用開始希望日（必ず具体的な日付か月を確認する。「来週」「そのうち」など曖昧な場合は「何月何日頃を想定していますか？」と聞き直す）
3. 希望月額料金（最安30,000円〜。選択肢は「30,000円」「40,000円」「50,000円」「50,000円以上」で提示）

【詳細情報（基本が揃ったら確認）】
4. 利用目的（Amazon配送/Uber Eats/軽貨物業/個人使用 など）
5. 希望利用期間（選択肢は「1ヶ月」「3ヶ月」「6ヶ月」「1年以上」の4択のみ）

## 開始日の確認ルール（重要）
- 「来週」「来月」「すぐ」などは「何月何日頃ですか？」と1回だけ聞き直す
- 「来月から」→ 来月1日として記録してOK
- 「〇月〇日」「〇月から」と言ったら、それをそのまま記録
- 具体的な月日が分かれば確認済みとして次へ進む

## 会話ルール
- 1ターンに質問は1〜2項目まで
- ユーザーが最初のメッセージで複数情報を伝えた場合は、重複して聞かない
- 親切で自然な日本語で応答する
- 丁寧すぎず、テンポよく会話を進める

## 選択肢ボタン（全ての質問に必須）
質問するときは必ず選択肢を出力する:
<options>["選択肢A", "選択肢B", "選択肢C"]</options>

開始日を聞くときの選択肢例:
<options>["3日後以降（最短）", "来月1日から", "日付を指定する"]</options>

## 開始日の最短ルール
- 最短でも「3日後以降」であることをユーザーに伝える
- 「今すぐ」「明日」「明後日」など3日以内の希望には「最短でも3日後以降からのご案内となります」と案内し、改めて日付を確認する

## ヒアリング完了時の動作（重要）
エリア・開始日・月額・目的・期間の5項目が揃ったら:
1. 「ありがとうございます！内容を確認して最適な車両をご提案いたします。しばらくお待ちください。」と伝える
2. 返答の末尾に必ず以下の完了タグを出力する
3. 完了タグを出力したら追加の質問は一切しない（氏名・連絡先も含め何も聞かない）

<van_inquiry>
{
  "area": "都道府県名",
  "startDate": "YYYY-MM-DD形式（例: 2026-09-01）または「来月1日」「9月から」などの表現",
  "monthlyBudget": 30000,
  "purpose": "利用目的",
  "durationMonths": 6
}
</van_inquiry>`,

  ai_blog_user_prompt: `あなたは軽バンレンタル業界に特化したSEOコンテンツライターです。日本語の法人担当者・個人事業主・配送業者に向けた、検索意図に沿った実用的なブログ記事を作成します。

記事は以下の原則に従ってください：
- 読者の具体的な悩みや課題から始める（ペインドリブン）
- 解決策としてChat VANのメリットを自然に紹介する
- 専門用語は必要最小限にし、分かりやすい言葉を使う
- 末尾にChat VANへの問い合わせを促すCTAを入れる`,

  ai_blog_rental_prompt: `あなたはレンタカー・カーリース業界に特化したSEOコンテンツライターです。日本語のレンタル会社経営者・管理職に向けた、稼働率改善や収益向上に関する実用的なブログ記事を作成します。

記事は以下の原則に従ってください：
- レンタル会社が抱える遊休車両・稼働率・収益安定の課題から始める
- Chat VANへの車両提供パートナーシップのメリットを自然に紹介する
- 具体的な数字や事例を使って説得力を高める
- 末尾にChat VANへのパートナー登録を促すCTAを入れる`,

  ai_prospect_score_prompt: `あなたはChat VAN（軽バンレンタルサービス）のBtoB営業AIです。
以下の企業リストの中から「Chat VANへの車両提供パートナー候補」として有望なものを最大5社選び、JSONのみで返してください。

Chat VANのサービス: チャットで軽バンをレンタルするサービス。レンタル会社と提携し遊休車両を有効活用。
理想のパートナー: 軽バンを保有するレンタル会社・リース会社・自動車販売会社。

企業リスト:
{CANDIDATES}

除外条件:
- 個人ブログ・メディア・求人・官公庁・金融・不動産は除外
- レンタカー・リース・自動車関連以外は低スコア

出力（JSONのみ、他の文字は不要）:
[{"idx":0,"companyName":"株式会社○○","industry":"{INDUSTRY}"}]`,

  ai_prospect_email_prompt: `Chat VANの営業メールを1通生成してください。

宛先企業: {COMPANY_NAME}（業種: {INDUSTRY}）
サービス概要: 軽バンのレンタルをチャットで手配するサービス。遊休車両を提供いただけるレンタル会社様と提携中。

条件:
- 件名: 30文字以内、【Chat VAN】で始める
- 本文: 180〜280文字。丁寧で簡潔、押しつけがましくない
- {会社名} プレースホルダーを冒頭宛名として使う
- 安定収益・稼働率アップの具体的ベネフィットに1行触れる

出力（JSONのみ）:
{"subject":"件名","body":"本文"}`,

  ai_ekyc_prompt: `あなたは日本の運転免許証と顔写真を審査するeKYCシステムです。
提出データ・免許証画像・セルフィーを総合的に照合し、以下のJSONのみ返してください:
{"result": "verified" | "rejected", "reason": "理由（日本語、30文字以内）"}

【審査基準】
以下をすべて確認し、1つでも問題があれば rejected にすること：
1. 年齢が18歳以上であること
2. 免許の有効期限が本日以降であること
3. 免許番号が12桁の数字であること
4. 氏名が実在しそうな日本人名であること
5. 免許種別が有効な値であること（普通・中型・大型・普通二輪・大型二輪・原付等）
6. 免許証画像がある場合、画像内の氏名・番号・有効期限と提出データが一致すること
7. セルフィーがある場合、免許証の顔写真と同一人物であること（なりすまし確認）

上記に問題がなければ verified を返すこと。`,

  ai_screening_prompt: `あなたは軽バン月額レンタルサービスの申込審査AIです。
申込データを分析し、以下のJSONのみ返してください:
{"result": "approved" | "rejected", "reason": "理由（日本語、50文字以内）"}

【審査方針】
初めて車を借りるユーザーがほとんどのため、保険・黒ナンバー・配送経験は一切審査対象にしない。
以下の2条件のみで判断する:
1. 利用目的が明らかに違法（麻薬・密輸・犯罪等）でないこと
2. 申込内容が明らかな嫌がらせ・テスト・無意味な入力でないこと
上記に該当しない限り、必ず approved にすること。`,
};

// ── GET /api/admin/ai-prompts — 全プロンプト一括取得 ──────────────────────────
router.get("/admin/ai-prompts", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable)
    .where(inArray(settingsTable.key, [...PROMPT_KEYS]));
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const result: Record<string, { value: string; isCustomized: boolean }> = {};
  for (const key of PROMPT_KEYS) {
    result[key] = {
      value: stored[key] ?? PROMPT_DEFAULTS[key],
      isCustomized: key in stored,
    };
  }
  res.json(result);
});

// ── PUT /api/admin/ai-prompts/:key — 個別保存 ────────────────────────────────
router.put("/admin/ai-prompts/:key", requireAdmin, async (req, res): Promise<void> => {
  const key = req.params.key as PromptKey;
  if (!(PROMPT_KEYS as readonly string[]).includes(key)) {
    res.status(400).json({ error: "不明なプロンプトキーです" }); return;
  }
  const { value } = req.body as { value: string };
  if (typeof value !== "string" || !value.trim()) { res.status(400).json({ error: "プロンプトを入力してください" }); return; }
  if (value.length > MAX_PROMPT_LENGTH) { res.status(400).json({ error: `プロンプトは${MAX_PROMPT_LENGTH.toLocaleString()}文字以内にしてください` }); return; }
  try {
    await db.insert(settingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
    await logAdminAudit(req, { action: "update", targetType: "ai_prompt", targetId: key, afterData: { customized: true, length: value.length } });
    res.json({ ok: true, key });
  } catch (error) {
    console.error("save ai prompt error:", error);
    res.status(500).json({ error: "プロンプトの保存に失敗しました" });
  }
});

// ── DELETE /api/admin/ai-prompts/:key — デフォルトに戻す ─────────────────────
router.delete("/admin/ai-prompts/:key", requireAdmin, async (req, res): Promise<void> => {
  const key = req.params.key as PromptKey;
  if (!(PROMPT_KEYS as readonly string[]).includes(key)) {
    res.status(400).json({ error: "不明なプロンプトキーです" }); return;
  }
  try {
    await db.delete(settingsTable).where(eq(settingsTable.key, key));
    await logAdminAudit(req, { action: "reset", targetType: "ai_prompt", targetId: key, afterData: { customized: false } });
    res.json({ ok: true, key, defaultValue: PROMPT_DEFAULTS[key] });
  } catch (error) {
    console.error("reset ai prompt error:", error);
    res.status(500).json({ error: "プロンプトの復元に失敗しました" });
  }
});

// ── 後方互換: 旧 GET/PUT /api/admin/ai-prompt ────────────────────────────────
router.get("/admin/ai-prompt", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_system_prompt"));
  res.json({ prompt: row?.value ?? PROMPT_DEFAULTS["ai_system_prompt"] });
});
router.put("/admin/ai-prompt", requireAdmin, async (req, res): Promise<void> => {
  const { prompt } = req.body as { prompt: string };
  if (typeof prompt !== "string" || !prompt.trim()) { res.status(400).json({ error: "プロンプトを入力してください" }); return; }
  if (prompt.length > MAX_PROMPT_LENGTH) { res.status(400).json({ error: `プロンプトは${MAX_PROMPT_LENGTH.toLocaleString()}文字以内にしてください` }); return; }
  await db.insert(settingsTable)
    .values({ key: "ai_system_prompt", value: prompt })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: prompt, updatedAt: new Date() } });
  await logAdminAudit(req, { action: "update", targetType: "ai_prompt", targetId: "ai_system_prompt", afterData: { customized: true, length: prompt.length } });
  res.json({ ok: true });
});

export default router;
