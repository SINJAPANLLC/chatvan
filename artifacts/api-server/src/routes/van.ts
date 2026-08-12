/**
 * Chat VAN — van rental routes
 */
import cron from "node-cron";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  vanApplicationsTable,
  vanProposalsTable,
  vanContractsTable,
  vanMessagesTable,
  vehiclesTable,
  rentalCompaniesTable,
  notificationsTable,
  usersTable,
  settingsTable,
  identityVerificationsTable,
  insurancePoliciesTable,
  gpsDevicesTable,
  gpsLocationsTable,
  breakdownsTable,
  recoveryCasesTable,
  paymentRetriesTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, optionalAuth } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logUserActivity } from "../lib/userLogger";
import { randomUUID } from "crypto";
import { squareFetch } from "../lib/square-authorize";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

// ── eKYC AI自動判定 ─────────────────────────────────────────────────────────
async function runAIeKYC(verificationId: number, data: {
  fullName: string; birthDate: string; licenseNumber: string;
  licenseExpiry: string; licenseType: string;
  licenseFront: string; licenseBack: string;
  selfiePhoto?: string;
  userId: number; applicationId: number;
}) {
  try {
    // 画像をサーバーサイドで取得してbase64化
    const fetchImageBase64 = async (objectPath: string): Promise<string | null> => {
      try {
        const file = await objectStorage.getObjectEntityFile(objectPath);
        const response = await objectStorage.downloadObject(file);
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer).toString("base64");
      } catch (err) {
        console.warn("[eKYC] 画像取得失敗:", objectPath, err instanceof ObjectNotFoundError ? "not found" : err);
        return null;
      }
    };

    const [frontB64, backB64, selfieB64] = await Promise.all([
      fetchImageBase64(data.licenseFront),
      fetchImageBase64(data.licenseBack),
      data.selfiePhoto ? fetchImageBase64(data.selfiePhoto) : Promise.resolve(null),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const birthYear = parseInt(data.birthDate?.slice(0, 4) ?? "0");
    const age = new Date().getFullYear() - birthYear;
    const hasImages = !!(frontB64 || backB64);
    const hasSelfie = !!selfieB64;

    const userContent: any[] = [
      {
        type: "text",
        text: `【提出データ】
氏名: ${data.fullName}
生年月日: ${data.birthDate}（年齢: ${age}歳）
免許番号: ${data.licenseNumber}
免許種別: ${data.licenseType}
有効期限: ${data.licenseExpiry}
本日: ${today}

【チェック項目】
1. 年齢が18歳以上か（${age}歳）
2. 有効期限が本日（${today}）以降か
3. 免許番号が12桁の数字か
4. 氏名が実在しそうな日本人名か
5. 免許種別が有効な値か（普通・中型・大型・普通二輪・大型二輪・原付等）
${hasImages ? "6. 免許証画像の氏名・番号・有効期限と提出データが一致するか" : "※ 免許証画像未取得 - テキストのみで判定"}
${hasSelfie ? "7. 顔写真と免許証の顔写真が同一人物か（なりすまし確認）" : "※ 顔写真なし"}

【画像の順番】
${frontB64 ? "1枚目: 免許証表面" : ""}
${backB64 ? "2枚目: 免許証裏面" : ""}
${selfieB64 ? "3枚目: 本人セルフィー（免許証の顔写真と照合してください）" : ""}`
      },
    ];
    if (frontB64) userContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${frontB64}`, detail: "high" } });
    if (backB64)  userContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${backB64}`,  detail: "high" } });
    if (selfieB64) userContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${selfieB64}`, detail: "high" } });

    // eKYCプロンプトをDB優先で取得
    let ekycSystemPrompt = `あなたは日本の運転免許証を審査するeKYCシステムです。\n以下のJSONのみ返してください:\n{"result": "verified" | "rejected", "reason": "理由（日本語、30文字以内）"}\n\n【審査方針】\n以下のいずれかに該当する場合のみ rejected にすること。それ以外は必ず verified にすること。\n- 有効期限が本日より過去（明らかに期限切れ）\n- 免許証画像が免許証以外のもの（例：白紙・全くの別物）\n- 年齢が18歳未満\n- 氏名が明らかに無意味な文字列（例：aaaaa、テスト）\n\n【重要】\n- 顔写真の照合はしないこと。カメラの画質・角度・明るさにより異なって見えることがあるため、顔の一致・不一致を理由にした rejected は禁止。\n- 免許証の文字が読み取りにくい場合も verified にすること。\n- 少しでも本物らしい免許証であれば verified にすること。`;
    try {
      const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_ekyc_prompt")).limit(1);
      if (row?.value) ekycSystemPrompt = row.value;
    } catch { /* fallback */ }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ekycSystemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const result: "verified" | "rejected" = parsed.result === "rejected" ? "rejected" : "verified";
    const reason: string = parsed.reason ?? "";

    await db.update(identityVerificationsTable).set({
      status: result as any,
      ...(result === "rejected" ? { rejectionReason: reason } : {}),
      updatedAt: new Date(),
    }).where(eq(identityVerificationsTable.id, verificationId));

    // ユーザーに通知
    await db.insert(notificationsTable).values({
      userId: data.userId,
      title: result === "verified" ? "Chat VAN - 本人確認完了" : "Chat VAN - 本人確認 要再提出",
      message: result === "verified"
        ? "本人確認（eKYC）が完了しました。審査に進みます。"
        : `本人確認が確認できませんでした: ${reason}。再度アップロードしてください。`,
    });

    // eKYC verified → AI審査を自動起動（application_received状態のまま審査が未実行の場合）
    if (result === "verified") {
      const [app] = await db.select().from(vanApplicationsTable)
        .where(eq(vanApplicationsTable.id, data.applicationId));
      if (app && app.status === "application_received") {
        setImmediate(() => runAIScreening(data.applicationId));
      }
    }
  } catch (err) {
    console.error("[eKYC] AI判定エラー:", err);
  }
}

// ── AI自動審査 ──────────────────────────────────────────────────────────────
/** 相対的な日付表現を YYYY-MM-DD と支払日（日）に変換する */
function parseStartDate(raw: string | null | undefined): { date: string; paymentDay: number } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  if (!raw) {
    const next = new Date(today);
    next.setDate(next.getDate() + 3);
    return { date: fmt(next), paymentDay: next.getDate() };
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return { date: raw, paymentDay: d.getDate() };
  }

  // 今月中 / 今すぐ / 即日
  if (/今月|今すぐ|即日|すぐ/.test(raw)) {
    return { date: fmt(today), paymentDay: today.getDate() };
  }

  // X月Y日
  const mdMatch = raw.match(/(\d{1,2})月(\d{1,2})日/);
  if (mdMatch) {
    const m = parseInt(mdMatch[1]) - 1;
    const d = parseInt(mdMatch[2]);
    const year = m < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear();
    const date = new Date(year, m, d);
    return { date: fmt(date), paymentDay: d };
  }

  // X月から / X月
  const mMatch = raw.match(/(\d{1,2})月/);
  if (mMatch) {
    const m = parseInt(mMatch[1]) - 1;
    const year = m < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear();
    const date = new Date(year, m, 1);
    return { date: fmt(date), paymentDay: 1 };
  }

  // 来月
  if (/来月/.test(raw)) {
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { date: fmt(next), paymentDay: 1 };
  }

  // 来週
  if (/来週/.test(raw)) {
    const next = new Date(today);
    next.setDate(next.getDate() + 7);
    return { date: fmt(next), paymentDay: next.getDate() };
  }

  // デフォルト: 3日後
  const next = new Date(today);
  next.setDate(next.getDate() + 3);
  return { date: fmt(next), paymentDay: next.getDate() };
}

async function runAIScreening(appId: number) {
  try {
    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app || app.status !== "application_received") return;

    // 審査プロンプトをDB優先で取得
    let screeningSystemPrompt = `あなたは軽バン月額レンタルサービスの申込審査AIです。\n申込データを分析し、以下のJSONのみ返してください:\n{"result": "approved" | "rejected", "reason": "理由（日本語、50文字以内）"}\n\n【審査方針】\n初めて車を借りるユーザーがほとんどのため、保険・黒ナンバー・配送経験は一切審査対象にしない。\n以下の2条件のみで判断する:\n1. 利用目的が明らかに違法（麻薬・密輸・犯罪等）でないこと\n2. 申込内容が明らかな嫌がらせ・テスト・無意味な入力でないこと\n上記に該当しない限り、必ず approved にすること。`;
    try {
      const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_screening_prompt")).limit(1);
      if (row?.value) screeningSystemPrompt = row.value;
    } catch { /* fallback */ }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: screeningSystemPrompt
        },
        {
          role: "user",
          content: `【申込データ】
エリア: ${app.area ?? "未記入"}
月額予算: ${app.monthlyBudget ? `¥${Number(app.monthlyBudget).toLocaleString()}` : "未記入"}
利用目的: ${app.purpose ?? "未記入"}
利用期間: ${app.durationMonths ?? "未記入"}ヶ月`
        }
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const result: "approved" | "rejected" = parsed.result === "rejected" ? "rejected" : "approved";
    const reason: string = parsed.reason ?? "";

    await db.update(vanApplicationsTable).set({
      status: result, updatedAt: new Date(),
    }).where(eq(vanApplicationsTable.id, appId));

    if (result === "approved") {
      // ── 審査通過 → 契約書を自動生成 ────────────────────────────────────
      try {
        const [latestProposal] = await db
          .select().from(vanProposalsTable)
          .where(eq(vanProposalsTable.applicationId, appId))
          .orderBy(desc(vanProposalsTable.createdAt))
          .limit(1);

        if (latestProposal) {
          const vehicleIds: number[] = JSON.parse(latestProposal.vehicleIds || "[]");
          const vehicleId = vehicleIds[0];
          if (vehicleId) {
            const [vehicle] = await db.select().from(vehiclesTable)
              .where(eq(vehiclesTable.id, vehicleId));
            if (vehicle) {
              const contractNumber = `CVN-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
              const { date: parsedStart, paymentDay } = parseStartDate(app.startDate);
              const [contract] = await db.insert(vanContractsTable).values({
                applicationId: appId,
                userId: app.userId!,
                vehicleId: vehicle.id,
                rentalCompanyId: vehicle.rentalCompanyId ?? undefined,
                monthlyPrice: vehicle.monthlyPrice,
                sinJapanFee: vehicle.sinJapanFee ?? "0",
                startDate: parsedStart,
                minimumTerm: 1,
                paymentDay,
                contractNumber,
                platformOperator: "合同会社SIN JAPAN",
                status: "draft",
              }).returning();

              await db.update(vanApplicationsTable)
                .set({ status: "contracting", updatedAt: new Date() })
                .where(eq(vanApplicationsTable.id, appId));

              await db.insert(notificationsTable).values({
                userId: app.userId!,
                title: "Chat VAN - 審査通過・契約書が届きました",
                message: "審査が通過しました！契約書の内容をご確認のうえ、電子署名をお願いします。",
              });
            }
          }
        } else {
          // 提案なしの場合はシンプル通知
          await db.insert(notificationsTable).values({
            userId: app.userId!,
            title: "Chat VAN - 審査通過",
            message: "審査が通過しました！担当者が契約書を準備しています。",
          });
        }
      } catch (contractErr) {
        console.error("[AI Screening] 契約自動生成エラー:", contractErr);
        await db.insert(notificationsTable).values({
          userId: app.userId!,
          title: "Chat VAN - 審査通過",
          message: "審査が通過しました！担当者が契約書を準備しています。",
        });
      }
    } else {
      await db.insert(notificationsTable).values({
        userId: app.userId!,
        title: "Chat VAN - 審査結果",
        message: `審査の結果、今回はお断りとさせていただきました。${reason}`,
      });
    }
  } catch (err) {
    console.error("[AI Screening] エラー:", err);
  }
}

const router: IRouter = Router();

// ── System prompt ──────────────────────────────────────────────────────────
const VAN_SYSTEM_PROMPT = `あなたは「Chat VAN」のAIアシスタントです。
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
</van_inquiry>`;

interface UserInfo { name: string; email: string; phone: string | null }

async function getSystemPrompt(user?: UserInfo): Promise<string> {
  let base = VAN_SYSTEM_PROMPT;
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_system_prompt"));
    if (row?.value) base = row.value;
  } catch { /* ignore */ }

  // ユーザー登録情報をプロンプト先頭に注入
  if (user) {
    const userBlock = `## ユーザー登録情報（システム管理済み・聞かないこと）
- 氏名: ${user.name}
- メールアドレス: ${user.email}
- 電話番号: ${user.phone ?? "未登録"}

`;
    base = userBlock + base;
  }
  return base;
}

function parseOptions(text: string): string[] | null {
  const match = text.match(/<options>([\s\S]*?)<\/options>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function parseVanInquiry(text: string): Record<string, unknown> | null {
  const match = text.match(/<van_inquiry>([\s\S]*?)<\/van_inquiry>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function cleanText(text: string): string {
  return text
    .replace(/<options>[\s\S]*?<\/options>/g, "")
    .replace(/<van_inquiry>[\s\S]*?<\/van_inquiry>/g, "")
    .trim();
}

// ── POST /van/start ────────────────────────────────────────────────────────
router.post("/van/start", optionalAuth, async (req: Request, res: Response) => {
  try {
    const { message } = req.body as { message: string };
    if (!message?.trim()) return res.status(400).json({ error: "message required" });
    const userId: number | undefined = (req.session as any)?.userId;

    // ユーザー登録情報を取得
    let userInfo: UserInfo | undefined;
    if (userId) {
      const [u] = await db.select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
        .from(usersTable).where(eq(usersTable.id, userId));
      if (u) userInfo = u;
    }

    const [app] = await db.insert(vanApplicationsTable).values({
      userId: userId ?? null,
      status: "new",
      requestText: message,
      // 登録情報を初期値として設定
      applicantName: userInfo?.name ?? null,
      phone: userInfo?.phone ?? null,
      email: userInfo?.email ?? null,
    }).returning();

    await db.insert(vanMessagesTable).values({ vanApplicationId: app.id, role: "user", content: message });

    const systemPrompt = await getSystemPrompt(userInfo);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: message }],
    });

    const aiText = completion.choices[0]?.message?.content ?? "ご連絡ありがとうございます。詳しくお聞かせください。";
    const options = parseOptions(aiText);
    const inquiry = parseVanInquiry(aiText);

    await db.insert(vanMessagesTable).values({ vanApplicationId: app.id, role: "assistant", content: aiText });

    if (inquiry) {
      await db.update(vanApplicationsTable).set({
        status: "hearing",
        area: inquiry.area as string,
        startDate: parseStartDate(inquiry.startDate as string).date,
        monthlyBudget: inquiry.monthlyBudget as number,
        purpose: inquiry.purpose as string,
        durationMonths: inquiry.durationMonths as number,
        applicantName: userInfo?.name ?? null,
        phone: userInfo?.phone ?? null,
        email: userInfo?.email ?? null,
        updatedAt: new Date(),
      }).where(eq(vanApplicationsTable.id, app.id));

      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
      for (const admin of admins) {
        await db.insert(notificationsTable).values({
          userId: admin.id,
          message: `新しい軽バン相談が届きました（ID: ${app.id} / ${inquiry.area} / ¥${(inquiry.monthlyBudget as number)?.toLocaleString()}/月）`,
          title: 'Chat VAN相談',
        });
      }
    }

    logUserActivity({
      userId: userId ?? null,
      action: "chat_start",
      detail: `相談開始: ${message.slice(0, 80)}`,
      targetId: app.id,
      targetType: "application",
      req,
    }).catch(() => {});
    return res.status(201).json({ applicationId: app.id, conversationId: app.id, aiMessage: cleanText(aiText), options, isComplete: !!inquiry });
  } catch (err) {
    console.error("van/start error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/applications/:id/messages ────────────────────────────────────
router.get("/van/applications/:id/messages", async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const messages = await db.select().from(vanMessagesTable)
      .where(eq(vanMessagesTable.vanApplicationId, appId))
      .orderBy(vanMessagesTable.createdAt);
    return res.json(messages.map(m => ({
      id: m.id,
      role: m.role,
      content: cleanText(m.content),
      options: parseOptions(m.content),
      createdAt: m.createdAt,
    })));
  } catch (err) {
    console.error("get messages error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/messages ───────────────────────────────────
router.post("/van/applications/:id/messages", optionalAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const { message } = req.body as { message: string };
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app) return res.status(404).json({ error: "Application not found" });

    // ユーザー登録情報を取得
    const sessionUserId: number | undefined = (req.session as any)?.userId ?? app.userId ?? undefined;
    let userInfo: UserInfo | undefined;
    if (sessionUserId) {
      const [u] = await db.select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
        .from(usersTable).where(eq(usersTable.id, sessionUserId));
      if (u) userInfo = u;
    }

    const history = await db.select().from(vanMessagesTable)
      .where(eq(vanMessagesTable.vanApplicationId, appId))
      .orderBy(vanMessagesTable.createdAt);

    await db.insert(vanMessagesTable).values({ vanApplicationId: appId, role: "user", content: message });

    const systemPrompt = await getSystemPrompt(userInfo);
    const openaiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: m.content })),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: openaiMessages });
    const aiText = completion.choices[0]?.message?.content ?? "申し訳ありません、もう一度お試しください。";
    const options = parseOptions(aiText);
    const inquiry = parseVanInquiry(aiText);

    await db.insert(vanMessagesTable).values({ vanApplicationId: appId, role: "assistant", content: aiText });

    logUserActivity({
      userId: sessionUserId ?? null,
      action: "chat_message",
      detail: message.slice(0, 80),
      targetId: appId,
      targetType: "application",
      req,
    }).catch(() => {});

    if (inquiry && app.status === "new") {
      const budget   = (inquiry.monthlyBudget as number) ?? app.monthlyBudget ?? 0;
      const area     = (inquiry.area as string) ?? app.area ?? "";
      const duration = (inquiry.durationMonths as number) ?? app.durationMonths ?? 0;

      // ── 申込情報を更新 ─────────────────────────────────────────────────────
      await db.update(vanApplicationsTable).set({
        status: "hearing",
        area,
        startDate: parseStartDate((inquiry.startDate as string) ?? app.startDate).date,
        monthlyBudget: budget,
        purpose: (inquiry.purpose as string) ?? app.purpose,
        durationMonths: duration,
        applicantName: userInfo?.name ?? app.applicantName,
        phone: userInfo?.phone ?? app.phone,
        email: userInfo?.email ?? app.email,
        updatedAt: new Date(),
      }).where(eq(vanApplicationsTable.id, appId));

      // ── 自動車両マッチング ─────────────────────────────────────────────────
      const allVehicles = await db
        .select({ vehicle: vehiclesTable, company: rentalCompaniesTable })
        .from(vehiclesTable)
        .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
        .where(eq(vehiclesTable.status, "available"));

      type ScoredVehicle = typeof allVehicles[0] & { score: number };
      const allScored: ScoredVehicle[] = allVehicles.map(row => {
        const totalPrice = Number(row.vehicle.monthlyPrice)
          + Number(row.vehicle.sinJapanFee ?? 0)
          + Number(row.vehicle.insuranceFee ?? 0);
        let score = 0;

        // エリア一致（都道府県名が含まれていればOK）
        const vPref = row.vehicle.prefecture ?? "";
        if (area && vPref && (area.includes(vPref) || vPref.includes(area))) score += 30;

        // 予算内（10%超過まで許容）
        if (budget > 0 && totalPrice <= budget * 1.10) score += 25;
        else if (budget > 0) score -= 10;

        // 最低利用期間をユーザーが満たしているか
        const minPeriod = row.vehicle.minPeriodMonths ?? 1;
        if (duration > 0 && duration >= minPeriod) score += 20;
        else if (duration > 0) score -= 5;

        // 価格が予算に近いほど高スコア（コスパ優先）
        if (budget > 0 && totalPrice <= budget) {
          score += Math.round((1 - totalPrice / budget) * 10);
        }

        return { ...row, score };
      }).sort((a, b) => b.score - a.score);

      // スコア上位3台を提案（条件不一致でも全台から選ぶ）
      const scored = allScored.slice(0, 3);

      if (scored.length > 0) {
        // ── 常に自動提案 ────────────────────────────────────────────────────
        const vehicleIds = scored.map(r => r.vehicle.id);
        const isGoodMatch = scored[0].score > 0;
        await db.insert(vanProposalsTable).values({
          applicationId: appId,
          vehicleIds: JSON.stringify(vehicleIds),
          message: isGoodMatch ? "AI自動マッチングによる提案" : "条件近似による自動提案",
        });
        await db.update(vanApplicationsTable)
          .set({ status: "proposed", updatedAt: new Date() })
          .where(eq(vanApplicationsTable.id, appId));

        // ユーザーへ通知
        if (app.userId) {
          await db.insert(notificationsTable).values({
            userId: app.userId,
            title: "Chat VAN - 車両提案",
            message: "条件に合う車両をご提案しました。チャット画面をご確認ください。",
          });
        }

        // チャット内に提案メッセージを追加
        const vehicleText = scored.map(r => {
          const v = r.vehicle;
          const price = Number(v.monthlyPrice) + Number(v.sinJapanFee ?? 0) + Number(v.insuranceFee ?? 0);
          return `▼ ${v.maker} ${v.model}（${v.prefecture ?? ""}）\n月額: ¥${price.toLocaleString()}/月\n最低期間: ${v.minPeriodMonths}ヶ月以上`;
        }).join("\n\n");
        const proposalMsg = isGoodMatch
          ? `条件に合う車両が見つかりました！以下の車両をご提案します。\n\n${vehicleText}\n\n「提案された車両を確認する」ボタンから詳細をご覧ください。`
          : `現在ご希望のエリアに空き車両の確保が完了次第すぐご案内できるよう、最も近い条件の車両をご提案します。\n\n${vehicleText}\n\n「提案された車両を確認する」ボタンから詳細をご覧ください。`;
        await db.insert(vanMessagesTable).values({
          vanApplicationId: appId,
          role: "assistant",
          content: proposalMsg,
        });
      }
    }

    return res.json({ message: cleanText(aiText), options, isComplete: !!inquiry, inquiry: inquiry ?? null });
  } catch (err) {
    console.error("send van message error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/applications ──────────────────────────────────────────────────
router.get("/van/applications", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, page = "1", limit = "20" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = status ? eq(vanApplicationsTable.status, status as any) : undefined;
    const [apps, [countRow]] = await Promise.all([
      db.select().from(vanApplicationsTable).where(whereClause).orderBy(desc(vanApplicationsTable.createdAt)).limit(parseInt(limit)).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable).where(whereClause),
    ]);
    return res.json({ applications: apps, total: Number(countRow.count) });
  } catch (err) {
    console.error("list applications error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/applications/stats ────────────────────────────────────────────
router.get("/van/applications/stats", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)                                                                      AS total,
        COUNT(*) FILTER (WHERE status IN (
          'new','hearing','proposed','application_received','screening',
          'approved','contracting','payment_pending','delivery_pending'
        ))                                                                            AS active,
        COUNT(*) FILTER (WHERE status = 'active')                                    AS contract,
        COUNT(*) FILTER (WHERE status = 'return_pending')                            AS return_pending,
        COUNT(*) FILTER (WHERE status IN ('completed','cancelled','rejected'))        AS closed,
        COUNT(*) FILTER (
          WHERE (created_at AT TIME ZONE 'Asia/Tokyo')::date
              = (NOW() AT TIME ZONE 'Asia/Tokyo')::date
        )                                                                             AS today,
        COUNT(*) FILTER (WHERE status = 'new')                                       AS new_count,
        COUNT(*) FILTER (WHERE status = 'hearing')                                   AS hearing,
        COUNT(*) FILTER (WHERE status = 'proposed')                                  AS proposed,
        COUNT(*) FILTER (WHERE status = 'rejected')                                  AS rejected
      FROM van_applications
    `) as any;
    const r = (rows?.rows ?? rows)?.[0] ?? {};
    return res.json({
      total:         Number(r.total ?? 0),
      active:        Number(r.active ?? 0),
      contract:      Number(r.contract ?? 0),
      returnPending: Number(r.return_pending ?? 0),
      closed:        Number(r.closed ?? 0),
      today:         Number(r.today ?? 0),
      newCount:      Number(r.new_count ?? 0),
      hearing:       Number(r.hearing ?? 0),
      proposed:      Number(r.proposed ?? 0),
      rejected:      Number(r.rejected ?? 0),
    });
  } catch (err) {
    console.error("application stats error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/applications/:id ──────────────────────────────────────────────
router.get("/van/applications/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, id));
    if (!app) return res.status(404).json({ error: "Not found" });

    let proposedVehicles = null;
    const [proposal] = await db.select().from(vanProposalsTable)
      .where(eq(vanProposalsTable.applicationId, id))
      .orderBy(desc(vanProposalsTable.createdAt)).limit(1);

    if (proposal) {
      const vehicleIds: number[] = JSON.parse(proposal.vehicleIds);
      if (vehicleIds.length > 0) {
        const rows = await db.select({ vehicle: vehiclesTable, company: rentalCompaniesTable })
          .from(vehiclesTable)
          .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
          .where(inArray(vehiclesTable.id, vehicleIds));
        proposedVehicles = rows.map(({ vehicle, company }) => ({
          ...vehicle,
          userPrice: Number(vehicle.monthlyPrice) + Number(vehicle.sinJapanFee ?? 0) + Number(vehicle.insuranceFee ?? 0),
          rentalCompany: company,
        }));
      }
    }

    // Get identity verification — application_id優先、なければ user_id で最新のverifiedを取得
    let idVerification: any = null;
    const [byApp] = await db.select().from(identityVerificationsTable)
      .where(eq(identityVerificationsTable.applicationId, id)).limit(1).catch(() => []);
    if (byApp) {
      idVerification = byApp;
    } else {
      const userId = app.userId;
      if (userId) {
        const rows = await db.execute(sql`
          SELECT * FROM identity_verifications
          WHERE user_id = ${userId}
          ORDER BY CASE status WHEN 'verified' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
          LIMIT 1
        `);
        idVerification = ((rows as any)?.rows ?? rows)[0] ?? null;
      }
    }

    // Get contract (vehicle + rentalCompany を JOIN)
    const contractRows = await db
      .select({ contract: vanContractsTable, vehicle: vehiclesTable, company: rentalCompaniesTable })
      .from(vanContractsTable)
      .leftJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
      .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .where(eq(vanContractsTable.applicationId, id))
      .limit(1)
      .catch(() => []);
    const contractRow = contractRows[0] ?? null;
    const contract = contractRow
      ? { ...contractRow.contract, vehicle: contractRow.vehicle ? { ...contractRow.vehicle, rentalCompany: contractRow.company } : null }
      : null;

    // pickup_photos / pickup_documents / planned_end_date を JSON パース or 取得
    let plannedEndDate: string | null = null;
    if (contract) {
      const raw = await db.execute(sql`SELECT planned_end_date FROM van_contracts WHERE id = ${(contract as any).id} LIMIT 1`);
      plannedEndDate = ((raw as any).rows ?? raw)[0]?.planned_end_date ?? null;
    }
    const contractWithParsed = contract ? {
      ...contract,
      plannedEndDate,
      pickupPhotos: (() => { try { return JSON.parse((contract as any).pickupPhotos ?? '[]'); } catch { return []; } })(),
      pickupDocuments: (() => { try { return JSON.parse((contract as any).pickupDocuments ?? '[]'); } catch { return []; } })(),
    } : null;

    return res.json({ ...app, proposedVehicles, identityVerification: idVerification ?? null, contract: contractWithParsed });
  } catch (err) {
    console.error("get application error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /van/applications/:id ────────────────────────────────────────────
router.patch("/van/applications/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const updates = { ...req.body, updatedAt: new Date() };
    const [updated] = await db.update(vanApplicationsTable).set(updates).where(eq(vanApplicationsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("update application error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/propose ────────────────────────────────────
router.post("/van/applications/:id/propose", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const { vehicleIds, message } = req.body as { vehicleIds: number[]; message?: string };

    await db.insert(vanProposalsTable).values({ applicationId: appId, vehicleIds: JSON.stringify(vehicleIds), message: message ?? null });

    const [app] = await db.update(vanApplicationsTable)
      .set({ status: "proposed", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId)).returning();

    if (app?.userId) {
      await db.insert(notificationsTable).values({
        userId: app.userId,
        message: "Chat VANから軽バンのご提案が届きました。チャットをご確認ください。",
        title: 'Chat VAN - 車両提案',
      });
    }

    const vehicles = await db.select().from(vehiclesTable).where(inArray(vehiclesTable.id, vehicleIds));
    const vehicleText = vehicles.map(v =>
      `▼ ${v.maker} ${v.model}（${v.prefecture ?? ""}）\n月額: ¥${(Number(v.monthlyPrice) + Number(v.sinJapanFee ?? 0)).toLocaleString()}/月\n最低期間: ${v.minPeriodMonths}ヶ月以上\n利用可能: ${v.availableFrom ?? "即日相談可"}`
    ).join("\n\n");

    const proposalMessage = `Chat VANからのご提案です。条件に合う車両をご用意しました。\n\n${vehicleText}\n\n${message ?? ""}`;
    await db.insert(vanMessagesTable).values({ vanApplicationId: appId, role: "assistant", content: proposalMessage });

    return res.json(app);
  } catch (err) {
    console.error("propose error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/accept ─────────────────────────────────────
router.post("/van/applications/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const { vehicleId } = req.body as { vehicleId: number };
    const [app] = await db.update(vanApplicationsTable)
      .set({ status: "application_received", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId)).returning();
    if (!app) return res.status(404).json({ error: "Not found" });

    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        message: `申込みを受け付けました（ID: ${appId}）`,
        title: 'Chat VAN - 申込受付',
      });
    }
    // 既にeKYC済みのユーザーはAI審査を即時実行
    if (app.userId) {
      const existingKyc = await db.execute(sql`
        SELECT id FROM identity_verifications
        WHERE user_id = ${app.userId} AND status = 'verified'
        LIMIT 1
      `);
      const kycRow = ((existingKyc as any)?.rows ?? existingKyc)[0];
      if (kycRow) {
        setImmediate(() => runAIScreening(appId));
      }
    }
    return res.json(app);
  } catch (err) {
    console.error("accept error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/dashboard ────────────────────────────────────────────────────
router.get("/van/dashboard", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const [
      [newConsultations], [pendingReview], [proposalSent],
      [activeApplications], [activeContracts], [returningSoon],
      [totalVehicles], [availableVehicles], [unpaidContracts],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable).where(eq(vanApplicationsTable.status, "new")),
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable).where(eq(vanApplicationsTable.status, "hearing")),
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable).where(eq(vanApplicationsTable.status, "proposed")),
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable)
        .where(inArray(vanApplicationsTable.status, ["application_received", "screening", "approved", "contracting"] as any[])),
      db.select({ count: sql<number>`count(*)` }).from(vanContractsTable).where(eq(vanContractsTable.status, "active" as any)),
      db.select({ count: sql<number>`count(*)` }).from(vanContractsTable).where(eq(vanContractsTable.status, "return_pending" as any)),
      db.select({ count: sql<number>`count(*)` }).from(vehiclesTable),
      db.select({ count: sql<number>`count(*)` }).from(vehiclesTable).where(eq(vehiclesTable.status, "available")),
      db.select({ count: sql<number>`count(*)` }).from(vanContractsTable).where(eq(vanContractsTable.status, "payment_issue" as any)),
    ]);

    // 売上内訳を並列取得
    let cardRevenue = 0, invoiceRevenue = 0, blackNumberRevenue = 0, blackNumberCount = 0, insuranceCount = 0;
    let thisMonthRevenue = 0, thisMonthGrossProfit = 0, totalRevenue = 0;

    await Promise.allSettled([
      // 今月の売上見込 (アクティブ契約 税込: (monthly_price + sin_japan_fee) × 1.1)
      db.execute(sql`
        SELECT
          COALESCE(SUM(ROUND((monthly_price + COALESCE(sin_japan_fee,0)) * 1.1)), 0) AS grand_total,
          COALESCE(SUM(ROUND(COALESCE(sin_japan_fee, 0) * 1.1)), 0)                  AS fee_total
        FROM van_contracts WHERE status = 'active'
      `).then((r: any) => {
        const d = (r?.rows ?? r)?.[0] ?? {};
        thisMonthRevenue    = Number(d.grand_total ?? 0);
        thisMonthGrossProfit = Number(d.fee_total  ?? 0);
      }),
      // カード売上 (Square決済成功 — 実際の請求額なので税込そのまま)
      db.execute(sql`SELECT COALESCE(SUM(amount),0) AS total FROM payment_retries WHERE result = 'success'`)
        .then((r: any) => { cardRevenue = Number((r?.rows ?? r)?.[0]?.total ?? 0); }),
      // 請求書売上 (invoices 支払済 — total_amount は税込で保存済み)
      db.execute(sql`SELECT COALESCE(SUM(total_amount),0) AS total FROM invoices WHERE status = 'paid'`)
        .then((r: any) => { invoiceRevenue = Number((r?.rows ?? r)?.[0]?.total ?? 0); }),
      // 黒ナンバー売上・件数 (税込: options_fee × 1.1)
      db.execute(sql`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(ROUND(COALESCE(options_fee,0) * 1.1)),0) AS total
        FROM van_contracts WHERE black_number_requested = true
      `).then((r: any) => {
        const d = (r?.rows ?? r)?.[0] ?? {};
        blackNumberRevenue = Number(d.total ?? 0);
        blackNumberCount   = Number(d.cnt   ?? 0);
      }),
      // 保険紹介件数
      db.execute(sql`SELECT COUNT(*) AS cnt FROM van_contracts WHERE insurance_referral_requested = true`)
        .then((r: any) => { insuranceCount = Number((r?.rows ?? r)?.[0]?.cnt ?? 0); }),
      // 累積売上（settlements完了 → fallback: payment_retries成功）
      db.execute(sql`SELECT COALESCE(SUM(user_payment_amount),0) AS total FROM settlements WHERE status = 'completed'`)
        .then((r: any) => { totalRevenue = Number((r?.rows ?? r)?.[0]?.total ?? 0); })
        .catch(() => db.execute(sql`SELECT COALESCE(SUM(amount),0) AS total FROM payment_retries WHERE result = 'success'`)
          .then((r: any) => { totalRevenue = Number((r?.rows ?? r)?.[0]?.total ?? 0); })),
    ]);

    // リスク指標
    let openIncidents = 0, paymentFailures7d = 0, openBreakdowns = 0, pendingReturns = 0, insuranceAlerts = 0;
    await Promise.allSettled([
      db.execute(sql`SELECT COUNT(*) AS c FROM van_incidents WHERE status = 'reported'`)
        .then((r: any) => { openIncidents = Number((r?.rows ?? r)?.[0]?.c ?? 0); }),
      db.select({ count: sql<number>`count(*)` }).from(paymentRetriesTable)
        .where(and(eq(paymentRetriesTable.result, 'failed'), sql`attempted_at > NOW() - INTERVAL '7 days'`))
        .then(([r]) => { paymentFailures7d = Number(r?.count ?? 0); }),
      db.execute(sql`SELECT COUNT(*) AS c FROM breakdowns WHERE status = 'reported'`)
        .then((r: any) => { openBreakdowns = Number((r?.rows ?? r)?.[0]?.c ?? 0); }),
      db.execute(sql`SELECT COUNT(*) AS c FROM returns WHERE status = 'requested'`)
        .then((r: any) => { pendingReturns = Number((r?.rows ?? r)?.[0]?.c ?? 0); }),
      db.select({ count: sql<number>`count(*)` }).from(insurancePoliciesTable)
        .where(and(eq(insurancePoliciesTable.status, 'active' as any), sql`expiry_date <= to_char(NOW() + INTERVAL '30 days', 'YYYY-MM-DD')`))
        .then(([r]) => { insuranceAlerts = Number(r?.count ?? 0); }),
    ]);

    return res.json({
      // KPI
      newConsultations: Number(newConsultations.count),
      pendingReview: Number(pendingReview.count),
      proposalSent: Number(proposalSent.count),
      activeApplications: Number(activeApplications.count),
      activeContracts: Number(activeContracts.count),
      returningSoon: Number(returningSoon.count),
      thisMonthRevenue,
      thisMonthGrossProfit,
      totalRevenue,
      cardRevenue,
      invoiceRevenue,
      blackNumberRevenue,
      blackNumberCount,
      insuranceCount,
      totalVehicles: Number(totalVehicles.count),
      availableVehicles: Number(availableVehicles.count),
      // リスク
      unpaidContracts: Number(unpaidContracts.count),
      paymentFailures7d,
      openIncidents,
      openBreakdowns,
      pendingReturns,
      insuranceAlerts,
    });
  } catch (err) {
    console.error("dashboard error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/dashboard/calendar ───────────────────────────────────────────
router.get("/van/dashboard/calendar", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const events: { date: string; type: string; label: string; id: number }[] = [];

    // 返却予定 (return_pending contracts → start_date + minimum_term 概算 or returns テーブル)
    const returnRows = await db.execute(sql`
      SELECT r.id, r.requested_return_date AS date, u.name AS user_name
      FROM returns r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.status IN ('requested','approved') AND r.requested_return_date IS NOT NULL
    `).catch(() => [] as any);
    for (const r of ((returnRows as any).rows ?? returnRows)) {
      if (r.date) events.push({ date: r.date.slice(0, 10), type: 'return', label: `返却: ${r.user_name ?? '—'}`, id: r.id });
    }

    // 納車予定 (delivery_pending applications)
    const deliveryRows = await db.execute(sql`
      SELECT va.id, vc.start_date AS date, u.name AS user_name
      FROM van_applications va
      LEFT JOIN van_contracts vc ON vc.application_id = va.id
      LEFT JOIN users u ON va.user_id = u.id
      WHERE va.status = 'delivery_pending' AND vc.start_date IS NOT NULL
    `).catch(() => [] as any);
    for (const r of ((deliveryRows as any).rows ?? deliveryRows)) {
      if (r.date) events.push({ date: r.date.slice(0, 10), type: 'delivery', label: `納車: ${r.user_name ?? '—'}`, id: r.id });
    }

    // 保険期限 (30日以内)
    const insuranceRows = await db.execute(sql`
      SELECT ip.id, ip.expiry_date AS date, v.maker || ' ' || v.model AS vehicle
      FROM insurance_policies ip
      LEFT JOIN vehicles v ON ip.vehicle_id = v.id
      WHERE ip.status = 'active' AND ip.expiry_date <= to_char(NOW() + INTERVAL '60 days', 'YYYY-MM-DD')
    `).catch(() => [] as any);
    for (const r of ((insuranceRows as any).rows ?? insuranceRows)) {
      if (r.date) events.push({ date: r.date.slice(0, 10), type: 'insurance', label: `保険期限: ${r.vehicle ?? '—'}`, id: r.id });
    }

    // 事故報告日
    const incidentRows = await db.execute(sql`
      SELECT i.id, COALESCE(i.occurred_at, to_char(i.created_at, 'YYYY-MM-DD')) AS date, u.name AS user_name
      FROM van_incidents i
      LEFT JOIN users u ON i.user_id = u.id
      WHERE i.status = 'reported'
    `).catch(() => [] as any);
    for (const r of ((incidentRows as any).rows ?? incidentRows)) {
      if (r.date) events.push({ date: String(r.date).slice(0, 10), type: 'incident', label: `事故報告: ${r.user_name ?? '—'}`, id: r.id });
    }

    return res.json(events.sort((a, b) => a.date.localeCompare(b.date)));
  } catch (err) {
    console.error("calendar error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Contracts ──────────────────────────────────────────────────────────────
router.get("/van/contracts", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: number | undefined = (req.session as any)?.userId;
    const user = req.query.userId ? parseInt(req.query.userId as string) : userId;
    const { status } = req.query as { status?: string };
    const rows = await db.select({ contract: vanContractsTable, vehicle: vehiclesTable, company: rentalCompaniesTable })
      .from(vanContractsTable)
      .leftJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
      .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .where(and(user ? eq(vanContractsTable.userId, user) : undefined, status ? eq(vanContractsTable.status, status as any) : undefined))
      .orderBy(desc(vanContractsTable.createdAt));
    const ids = rows.map(r => r.contract.id);
    let paymentMethods: Record<number, string> = {};
    if (ids.length > 0) {
      const pmRows = await db.execute(sql`SELECT id, payment_method FROM van_contracts WHERE id = ANY(ARRAY[${sql.raw(ids.join(','))}]::int[])`);
      for (const r of ((pmRows as any).rows ?? pmRows)) paymentMethods[r.id] = r.payment_method ?? null;
    }
    return res.json(rows.map(({ contract, vehicle, company }) => ({
      ...contract,
      paymentMethod: paymentMethods[contract.id] ?? null,
      vehicle: vehicle ? { ...vehicle, rentalCompany: company } : null,
    })));
  } catch (err) {
    console.error("list contracts error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/van/contracts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const [row] = await db.select({ contract: vanContractsTable, vehicle: vehiclesTable, company: rentalCompaniesTable })
      .from(vanContractsTable)
      .leftJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
      .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .where(eq(vanContractsTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({ ...row.contract, vehicle: { ...row.vehicle, rentalCompany: row.company } });
  } catch (err) {
    console.error("get contract error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// GET /van/contracts/:id/print  契約書印刷用HTML
router.get("/van/contracts/:id/print", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const rows = await db.execute(sql`
      SELECT vc.*, v.maker, v.model, v.license_plate, v.prefecture, v.year,
        v.inspection_expiry, v.mileage_limit, v.smoking_policy, v.vin,
        rc.name as rc_name, rc.phone as rc_phone,
        u.name as user_name, u.phone as user_phone, u.email as user_email
      FROM van_contracts vc
      LEFT JOIN vehicles v ON vc.vehicle_id = v.id
      LEFT JOIN rental_companies rc ON v.rental_company_id = rc.id
      LEFT JOIN users u ON vc.user_id = u.id
      WHERE vc.id = ${id}
      LIMIT 1
    `);
    const c: any = ((rows as any)?.rows ?? rows)[0];
    if (!c) return res.status(404).send("Not found");
    const sig = (() => { try { const p = JSON.parse(c.signature_data ?? 'null'); return p?.signature ?? null; } catch { return null; } })();
    const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('ja-JP') : '—';
    const yen = (v: any) => v ? `¥${Number(v).toLocaleString()}` : '—';
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>契約書 ${c.contract_number ?? `#${c.id}`}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#111;font-size:14px;line-height:1.6}
  h1{font-size:22px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:24px}
  h2{font-size:15px;border-left:4px solid #111;padding-left:10px;margin:28px 0 10px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  td,th{border:1px solid #ddd;padding:8px 12px;font-size:13px}
  th{background:#f5f5f5;font-weight:600;width:36%;text-align:left}
  .sig{border:1px solid #ddd;border-radius:4px;padding:4px;max-height:80px}
  .footer{margin-top:48px;font-size:12px;color:#666;text-align:center}
  @media print{body{margin:0}button{display:none}}
</style></head><body>
<button onclick="window.print()" style="float:right;padding:8px 16px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">印刷</button>
<h1>車両貸渡契約書</h1>
<p style="text-align:right;color:#666">契約番号: <strong>${c.contract_number ?? `CVN-${c.id}`}</strong></p>

<h2>契約当事者</h2>
<table>
  <tr><th>利用者氏名</th><td>${c.user_name ?? '—'}</td></tr>
  <tr><th>電話番号</th><td>${c.user_phone ?? '—'}</td></tr>
  <tr><th>メールアドレス</th><td>${c.user_email ?? '—'}</td></tr>
  <tr><th>貸渡事業者</th><td>${c.rc_name ?? '—'}${c.rc_phone ? ` / TEL: ${c.rc_phone}` : ''}</td></tr>
  <tr><th>プラットフォーム</th><td>${c.platform_operator ?? '合同会社SIN JAPAN'}</td></tr>
</table>

<h2>車両情報</h2>
<table>
  <tr><th>車名</th><td>${c.maker ?? ''} ${c.model ?? ''}</td></tr>
  <tr><th>ナンバー</th><td>${c.license_plate ?? '—'}</td></tr>
  <tr><th>車台番号</th><td>${c.vin ?? '—'}</td></tr>
  <tr><th>年式</th><td>${c.year ? `${c.year}年式` : '—'}</td></tr>
  <tr><th>都道府県</th><td>${c.prefecture ?? '—'}</td></tr>
  <tr><th>車検満了</th><td>${fmt(c.inspection_expiry)}</td></tr>
  <tr><th>喫煙</th><td>${c.smoking_policy === 'no_smoking' ? '禁煙' : c.smoking_policy === 'smoking_ok' ? '喫煙可' : (c.smoking_policy ?? '—')}</td></tr>
  <tr><th>走行上限</th><td>${c.mileage_limit ? `${Number(c.mileage_limit).toLocaleString()} km/月` : '制限なし'}</td></tr>
</table>

<h2>契約条件</h2>
<table>
  <tr><th>月額利用料</th><td>${yen(c.monthly_price)}</td></tr>
  <tr><th>開始日</th><td>${fmt(c.start_date)}</td></tr>
  <tr><th>終了予定日</th><td>${fmt(c.planned_end_date ?? c.end_date)}</td></tr>
  <tr><th>支払日</th><td>${c.payment_day ? `毎月${c.payment_day}日` : '—'}</td></tr>
  <tr><th>支払方法</th><td>${c.payment_method === 'invoice' ? '請求書払い' : c.payment_method === 'card' ? 'カード決済' : (c.payment_method ?? '—')}</td></tr>
  <tr><th>最低利用期間</th><td>${c.minimum_term ? `${c.minimum_term}ヶ月` : '—'}</td></tr>
</table>

<h2>同意記録</h2>
<table>
  <tr><th>プラットフォーム契約同意</th><td>${fmt(c.platform_contract_agreed_at)}</td></tr>
  <tr><th>車両貸渡契約同意</th><td>${fmt(c.vehicle_contract_agreed_at)}</td></tr>
  <tr><th>利用規約同意</th><td>${fmt(c.terms_agreed_at)}</td></tr>
  <tr><th>GPS利用同意</th><td>${c.gps_consent ? '同意済み' : '未同意'}</td></tr>
</table>

${sig ? `<h2>電子署名</h2><img src="${sig}" class="sig" alt="電子署名" />` : ''}
${c.special_terms ? `<h2>特記事項</h2><p style="white-space:pre-wrap">${c.special_terms}</p>` : ''}

<div class="footer">本書類は Chat VAN（合同会社SIN JAPAN）が発行した電子契約書です。</div>
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error("contract print error:", err);
    return res.status(500).send("Internal error");
  }
});

// PATCH /van/contracts/:id/pickup  受け取り日時・場所の更新（管理者）
router.patch("/van/contracts/:id/pickup", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { pickupAddress, pickupDatetime, sendNotification } = req.body;

    await db.execute(sql`
      UPDATE van_contracts
      SET pickup_address = ${pickupAddress ?? null},
          pickup_datetime = ${pickupDatetime ? new Date(pickupDatetime) : null},
          updated_at = NOW()
      WHERE id = ${id}
    `);

    if (sendNotification) {
      const row = await db.execute(sql`SELECT user_id FROM van_contracts WHERE id = ${id} LIMIT 1`);
      const userId = ((row as any)?.rows ?? row)[0]?.user_id;
      if (userId) {
        const dtStr = pickupDatetime
          ? new Date(pickupDatetime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          : '日時未定';
        await db.insert(notificationsTable).values({
          userId,
          title: '【Chat VAN】車両受け取り日時・場所のご案内',
          message: `受け取り日時: ${dtStr}\n受け取り場所: ${pickupAddress || '未定'}\n\nご不明な点はチャットよりお問い合わせください。`,
        });
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("pickup update error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/contracts", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body;
    // Generate contract number
    const contractNumber = `CVN-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const [contract] = await db.insert(vanContractsTable).values({ ...body, contractNumber }).returning();

    // Update application status
    if (body.applicationId) {
      await db.update(vanApplicationsTable).set({ status: "contracting", updatedAt: new Date() })
        .where(eq(vanApplicationsTable.id, body.applicationId));
    }

    // Notify user
    if (body.userId) {
      await db.insert(notificationsTable).values({
        userId: body.userId,
        message: "契約書が作成されました。内容をご確認ください。",
        title: 'Chat VAN - 契約書',
      });
    }

    return res.status(201).json(contract);
  } catch (err) {
    console.error("create contract error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// PATCH /van/invoices/:id/status  請求書ステータス変更（管理者）
router.patch("/van/invoices/:id/status", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { status } = req.body; // 'pending' | 'paid' | 'overdue' | 'cancelled'
    if (!['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    await db.execute(sql`
      UPDATE invoices
      SET status = ${status},
          paid_at = ${status === 'paid' ? sql`NOW()` : sql`NULL`}
      WHERE id = ${id}
    `);
    return res.json({ ok: true });
  } catch (err) {
    console.error("invoice status update error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/van/contracts/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db.update(vanContractsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(vanContractsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("update contract error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 契約書同意（2本） ──────────────────────────────────────────────────────
// POST /van/contracts/:id/agree-platform  ユーザーがプラットフォーム利用契約に同意
router.post("/van/contracts/:id/agree-platform", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"];
    const signatureData = JSON.stringify({ ip: ipAddress, ua: userAgent, agreedAt: new Date().toISOString() });

    const [updated] = await db.update(vanContractsTable).set({
      platformContractAgreedAt: new Date(),
      signatureData,
      updatedAt: new Date(),
    }).where(eq(vanContractsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    // If both contracts agreed, update to pending_payment
    if (updated.vehicleContractAgreedAt) {
      await db.update(vanContractsTable).set({ status: "pending_payment", termsAgreedAt: new Date(), updatedAt: new Date() })
        .where(eq(vanContractsTable.id, id));
      // Notify admin
      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
      for (const admin of admins) {
        await db.insert(notificationsTable).values({
          userId: admin.id, title: 'Chat VAN - 契約同意完了',
          message: `契約書への同意が完了しました（契約ID: ${id}）。決済手続きをお願いします。`,
        });
      }
    }
    return res.json(updated);
  } catch (err) {
    console.error("agree platform error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /van/contracts/:id/agree-vehicle  ユーザーが車両貸渡契約に同意
router.post("/van/contracts/:id/agree-vehicle", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const signatureData = JSON.stringify({ ip: req.ip, ua: req.headers["user-agent"], agreedAt: new Date().toISOString() });

    const [updated] = await db.update(vanContractsTable).set({
      vehicleContractAgreedAt: new Date(),
      signatureData,
      updatedAt: new Date(),
    }).where(eq(vanContractsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    if (updated.platformContractAgreedAt) {
      await db.update(vanContractsTable).set({ status: "pending_payment", termsAgreedAt: new Date(), updatedAt: new Date() })
        .where(eq(vanContractsTable.id, id));
    }
    return res.json(updated);
  } catch (err) {
    console.error("agree vehicle error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/contracts/:id/sign  電子署名（一括同意） ─────────────────────
router.post("/van/contracts/:id/sign", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const userId: number | undefined = (req.session as any)?.userId;
    const { signatureData, blackNumberRequested, insuranceReferralRequested, gpsConsent } = req.body as {
      signatureData?: string;
      blackNumberRequested?: boolean;
      insuranceReferralRequested?: boolean;
      gpsConsent?: boolean;
    };

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, id));
    if (!contract) return res.status(404).json({ error: "Not found" });
    if (contract.userId !== userId) return res.status(403).json({ error: "Forbidden" });

    const meta = JSON.stringify({
      ip: req.ip,
      ua: req.headers["user-agent"],
      agreedAt: new Date().toISOString(),
      hasSignature: !!signatureData,
    });

    const BLACK_NUMBER_FEE = 19800;
    const optionsFee = blackNumberRequested ? BLACK_NUMBER_FEE : 0;

    const now = new Date();
    const [updated] = await db.update(vanContractsTable).set({
      platformContractAgreedAt: now,
      vehicleContractAgreedAt: now,
      termsAgreedAt: now,
      signatureData: signatureData ? JSON.stringify({ meta, signature: signatureData }) : meta,
      status: "pending_payment",
      paymentDay: now.getDate(),
      updatedAt: now,
    }).where(eq(vanContractsTable.id, id)).returning();

    // オプションをRAW SQLで保存（Drizzle schema反映前のカラム対応）
    await db.execute(sql`
      UPDATE van_contracts SET
        black_number_requested = ${!!blackNumberRequested},
        insurance_referral_requested = ${!!insuranceReferralRequested},
        gps_consent = ${!!gpsConsent},
        options_fee = ${optionsFee}
      WHERE id = ${id}
    `);

    // アプリ側ステータスを payment_pending へ
    if (updated.applicationId) {
      await db.update(vanApplicationsTable)
        .set({ status: "payment_pending", updatedAt: now })
        .where(eq(vanApplicationsTable.id, updated.applicationId));
    }

    // 管理者・ユーザーに通知
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "Chat VAN - 契約署名完了",
        message: `契約書への電子署名が完了しました（契約ID: ${id}）。`,
      });
      // 黒ナンバー代理取得の申請通知
      if (blackNumberRequested) {
        await db.insert(notificationsTable).values({
          userId: admin.id,
          title: "🚗 黒ナンバー代理取得の依頼",
          message: `契約ID: ${id} のユーザーが黒ナンバー代理取得を希望しています。手続きを進めてください。`,
        });
      }
      // 保険紹介の申請通知
      if (insuranceReferralRequested) {
        await db.insert(notificationsTable).values({
          userId: admin.id,
          title: "🛡️ 保険紹介の依頼",
          message: `契約ID: ${id} のユーザーが保険紹介を希望しています。担当者から連絡してください。`,
        });
      }
    }
    await db.insert(notificationsTable).values({
      userId: userId!,
      title: "Chat VAN - 署名受付完了",
      message: "電子署名を受け付けました。次はお支払い手続きへお進みください。",
    });

    return res.json({ ok: true, contract: updated });
  } catch (err) {
    console.error("sign contract error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/contracts/:id/square-charge  Square決済 ─────────────────────
router.post("/van/contracts/:id/square-charge", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { sourceId } = req.body as { sourceId: string };
    if (!sourceId) return res.status(400).json({ error: "sourceId required" });

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, id));
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    const monthlyBase = Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0);
    // optionsFee は契約署名時に保存済み（raw SQL で読む）
    const optionsRow = await db.execute(sql`SELECT options_fee FROM van_contracts WHERE id = ${id}`);
    const optionsFee = Number((optionsRow as any)?.rows?.[0]?.options_fee ?? 0);
    const totalAmount = Math.round(monthlyBase * 1.1) + optionsFee;
    if (totalAmount <= 0) return res.status(400).json({ error: "金額が設定されていません" });

    const squareRes = await squareFetch("/v2/payments", "POST", {
      source_id: sourceId,
      idempotency_key: randomUUID(),
      amount_money: { amount: totalAmount, currency: "JPY" },
      location_id: process.env.SQUARE_LOCATION_ID,
      autocomplete: true,
      note: `Chat VAN 初回決済 契約#${id}${optionsFee > 0 ? " +オプション" : ""}`,
    });

    const data = await squareRes.json() as any;
    if (!squareRes.ok) {
      const errMsg = (() => {
        const code = data.errors?.[0]?.code ?? "";
        const msgs: Record<string, string> = {
          INVALID_CARD_DATA: "カード情報が無効です", PAN_FAILURE: "カード番号が正しくありません",
          CARD_EXPIRED: "カードの有効期限が切れています", INSUFFICIENT_FUNDS: "残高が不足しています",
          GENERIC_DECLINE: "カードが拒否されました",
        };
        return msgs[code] ?? "決済処理中にエラーが発生しました";
      })();
      return res.status(502).json({ error: errMsg });
    }

    // 決済成功 → contract/application/vehicle をアクティブに
    await db.execute(sql`UPDATE van_contracts SET status = 'active', payment_method = 'card', updated_at = NOW() WHERE id = ${id}`);
    if (contract.applicationId) {
      await db.update(vanApplicationsTable).set({ status: "active", updatedAt: new Date() }).where(eq(vanApplicationsTable.id, contract.applicationId));
    }
    await db.update(vehiclesTable).set({ status: "rented", updatedAt: new Date() }).where(eq(vehiclesTable.id, contract.vehicleId));

    // カード情報 + Square Customer/Card on file を保存
    const card = data.payment?.card_details?.card;
    if (card && contract.userId) {
      const expiry = card.exp_month && card.exp_year ? `${String(card.exp_month).padStart(2,'0')}/${String(card.exp_year).slice(-2)}` : null;

      // 既存ユーザー情報を取得
      const userRow = await db.execute(sql`SELECT square_customer_id, name, email FROM users WHERE id = ${contract.userId} LIMIT 1`);
      const userInfo: any = ((userRow as any)?.rows ?? userRow)[0];
      let customerId: string | null = userInfo?.square_customer_id ?? null;
      let cardId: string | null = null;

      try {
        // Square Customer が未作成なら作成
        if (!customerId) {
          const custRes = await squareFetch("/v2/customers", "POST", {
            idempotency_key: randomUUID(),
            given_name: userInfo?.name ?? "Chat VAN User",
            email_address: userInfo?.email ?? undefined,
            reference_id: String(contract.userId),
          });
          if (custRes.ok) {
            const custData = await custRes.json() as any;
            customerId = custData.customer?.id ?? null;
          }
        }

        // Card on file を作成
        if (customerId) {
          const cardRes = await squareFetch("/v2/cards", "POST", {
            idempotency_key: randomUUID(),
            source_id: sourceId,
            card: { customer_id: customerId },
          });
          if (cardRes.ok) {
            const cardData = await cardRes.json() as any;
            cardId = cardData.card?.id ?? null;
          }
        }
      } catch (e) {
        console.error("Square customer/card creation error:", e);
      }

      await db.execute(sql`
        UPDATE users SET
          card_brand = ${card.card_brand ?? null},
          card_last4 = ${card.last_4 ?? null},
          card_expiry = ${expiry},
          square_customer_id = ${customerId},
          square_card_id = ${cardId}
        WHERE id = ${contract.userId}
      `);
    }

    await db.insert(notificationsTable).values({
      userId: contract.userId,
      title: "Chat VAN - 決済完了・ご利用開始",
      message: `カード決済が完了しました（¥${totalAmount.toLocaleString()}）。レンタル会社から受け取り案内が届きます。`,
    });

    return res.json({ ok: true, paymentId: data.payment?.id });
  } catch (err) {
    console.error("square-charge error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /van/payment-retries/:id/retry  再決済（カード on file があれば Square 課金、なければ手動確認）
router.post("/van/payment-retries/:id/retry", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { manual } = req.body; // manual=true のとき強制手動確認

    const rows = await db.execute(sql`
      SELECT pr.*,
        u.square_customer_id, u.square_card_id, u.name as user_name
      FROM payment_retries pr
      LEFT JOIN van_contracts vc ON pr.contract_id = vc.id
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.id = ${id} LIMIT 1
    `);
    const pr: any = ((rows as any)?.rows ?? rows)[0];
    if (!pr) return res.status(404).json({ error: "Not found" });

    const amount = Number(pr.amount ?? 0);
    const hasCard = !manual && pr.square_card_id && pr.square_customer_id;

    if (hasCard) {
      // Square カード on file で再課金
      const squareRes = await squareFetch("/v2/payments", "POST", {
        source_id: pr.square_card_id,
        customer_id: pr.square_customer_id,
        idempotency_key: randomUUID(),
        amount_money: { amount, currency: "JPY" },
        autocomplete: true,
        note: `Chat VAN 再決済 period=${pr.period_month}`,
      });
      const data = await squareRes.json() as any;

      if (!squareRes.ok) {
        const errCode = data.errors?.[0]?.code ?? "";
        const errMsgs: Record<string, string> = {
          INVALID_CARD_DATA: "カード情報が無効です", CARD_EXPIRED: "カードの有効期限が切れています",
          INSUFFICIENT_FUNDS: "残高不足です", GENERIC_DECLINE: "カードが拒否されました",
        };
        const errMsg = errMsgs[errCode] ?? "Square課金に失敗しました";
        await db.execute(sql`
          UPDATE payment_retries SET result = 'failed', failure_reason = ${errMsg}, attempted_at = NOW()
          WHERE id = ${id}
        `);
        return res.status(502).json({ error: errMsg });
      }

      await db.execute(sql`
        UPDATE payment_retries
        SET result = 'success', failure_reason = NULL,
            square_payment_id = ${data.payment?.id ?? null}, attempted_at = NOW()
        WHERE id = ${id}
      `);
      if (pr.user_id) {
        await db.insert(notificationsTable).values({
          userId: pr.user_id,
          title: "Chat VAN - 月額料金のお支払いが完了しました",
          message: `${pr.period_month ?? ''}分の月額料金（¥${amount.toLocaleString()}）のお支払いが完了しました。`,
        });
      }
      return res.json({ ok: true, method: 'card' });

    } else {
      // カードなし → 手動入金確認
      await db.execute(sql`
        UPDATE payment_retries
        SET result = 'success',
            failure_reason = '[手動入金確認]',
            attempted_at = NOW()
        WHERE id = ${id}
      `);
      if (pr.user_id) {
        await db.insert(notificationsTable).values({
          userId: pr.user_id,
          title: "Chat VAN - お支払いを確認しました",
          message: `${pr.period_month ?? ''}分のお支払いを確認しました（¥${amount.toLocaleString()}）。`,
        });
      }
      return res.json({ ok: true, method: 'manual' });
    }
  } catch (err) {
    console.error("retry error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /van/contracts/:id/additional-charge  追加決済（カード or 請求書）
router.post("/van/contracts/:id/additional-charge", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const contractId = parseInt(String(req.params.id));
    const { amount, description, method, dueDate } = req.body as {
      amount: number; description: string; method: 'card' | 'invoice'; dueDate?: string;
    };
    if (!amount || amount <= 0) return res.status(400).json({ error: "金額を正しく入力してください" });
    if (!description) return res.status(400).json({ error: "摘要を入力してください" });

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, contractId));
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    if (method === 'card') {
      // カード on file で課金
      const userRow = await db.execute(sql`SELECT square_customer_id, square_card_id FROM users WHERE id = ${contract.userId} LIMIT 1`);
      const user: any = ((userRow as any)?.rows ?? userRow)[0];
      if (!user?.square_card_id || !user?.square_customer_id) {
        return res.status(400).json({ error: "登録済みカードがありません。請求書払いを選択してください。" });
      }
      const chargeAmount = Math.round(amount);
      const squareRes = await squareFetch("/v2/payments", "POST", {
        source_id: user.square_card_id,
        customer_id: user.square_customer_id,
        idempotency_key: randomUUID(),
        amount_money: { amount: chargeAmount, currency: "JPY" },
        autocomplete: true,
        note: `Chat VAN 追加決済 契約#${contractId} ${description}`,
      });
      const data = await squareRes.json() as any;
      if (!squareRes.ok) {
        const code = data.errors?.[0]?.code ?? "";
        const msgs: Record<string, string> = {
          CARD_EXPIRED: "カードの有効期限が切れています",
          INSUFFICIENT_FUNDS: "残高が不足しています",
          GENERIC_DECLINE: "カードが拒否されました",
        };
        return res.status(502).json({ error: msgs[code] ?? "カード決済に失敗しました" });
      }
      // payment_retries に成功記録
      await db.execute(sql`
        INSERT INTO payment_retries (contract_id, user_id, amount, period_month, result, square_payment_id, failure_reason, attempted_at)
        VALUES (${contractId}, ${contract.userId}, ${chargeAmount}, ${description}, 'success', ${data.payment?.id ?? null}, NULL, NOW())
      `);
      if (contract.userId) {
        await db.insert(notificationsTable).values({
          userId: contract.userId,
          title: "Chat VAN - 追加決済が完了しました",
          message: `${description}（¥${chargeAmount.toLocaleString()}）の決済が完了しました。`,
        });
      }
      return res.json({ ok: true, method: 'card' });

    } else {
      // 請求書作成
      const now = new Date();
      const invoiceNumber = `INV-${contractId}-ADD-${now.getTime()}`;
      const subtotal = Math.round(amount);
      const tax = Math.floor(subtotal * 0.1);
      const totalAmount = subtotal + tax;
      const due = dueDate ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()).padStart(2,'0')}`;
      await db.execute(sql`
        INSERT INTO invoices (user_id, invoice_number, period_start, period_end, subtotal, tax, total_amount, status, due_date, created_at)
        VALUES (${contract.userId}, ${invoiceNumber}, NOW(), NOW(), ${subtotal}, ${tax}, ${totalAmount}, 'pending', ${due}, NOW())
      `);
      return res.json({ ok: true, method: 'invoice', invoiceNumber, totalAmount });
    }
  } catch (err) {
    console.error("additional-charge error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /van/contracts/:id/options  支払い前にオプションを変更 ───────────
router.patch("/van/contracts/:id/options", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const userId: number | undefined = (req.session as any)?.userId;
    const { blackNumberRequested, insuranceReferralRequested } = req.body as {
      blackNumberRequested?: boolean;
      insuranceReferralRequested?: boolean;
    };

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, id));
    if (!contract) return res.status(404).json({ error: "Not found" });
    if (contract.userId !== userId) return res.status(403).json({ error: "Forbidden" });
    if (contract.status !== "pending_payment") return res.status(400).json({ error: "支払い前のみ変更できます" });

    const BLACK_NUMBER_FEE = 19800;
    const optionsFee = blackNumberRequested ? BLACK_NUMBER_FEE : 0;

    await db.execute(sql`
      UPDATE van_contracts SET
        black_number_requested = ${!!blackNumberRequested},
        insurance_referral_requested = ${!!insuranceReferralRequested},
        options_fee = ${optionsFee},
        updated_at = NOW()
      WHERE id = ${id}
    `);

    return res.json({ ok: true, optionsFee });
  } catch (err) {
    console.error("patch options error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/contracts/:id/pay  ユーザーが決済を確定 ──────────────────────
router.post("/van/contracts/:id/pay", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { method } = req.body as { method?: string };

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, id));
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    // invoice 払いは法人口座が承認済み（approved）のみ許可
    if (method === "invoice") {
      const [user] = await db.select({ creditStatus: usersTable.creditStatus })
        .from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
      if (!user || user.creditStatus !== "approved") {
        return res.status(400).json({
          error: user?.creditStatus === "pending"
            ? "法人口座は現在審査中です。承認後にご利用いただけます。"
            : "法人口座の申請が必要です。先に法人情報を入力してください。"
        });
      }
    }

    // 契約をアクティブに・申込は「受け取り待ち」に・支払方法を記録
    await db.execute(sql`UPDATE van_contracts SET status = 'active', payment_method = ${method ?? 'card'}, updated_at = NOW() WHERE id = ${id}`);

    if (contract.applicationId) {
      await db.update(vanApplicationsTable)
        .set({ status: "delivery_pending", updatedAt: new Date() })
        .where(eq(vanApplicationsTable.id, contract.applicationId));
    }

    // 車両を rented に（提案一覧から除外するため）
    if (contract.vehicleId) {
      await db.update(vehiclesTable)
        .set({ status: "rented", updatedAt: new Date() })
        .where(eq(vehiclesTable.id, contract.vehicleId));
    }

    // ユーザー通知
    await db.insert(notificationsTable).values({
      userId: contract.userId,
      title: "Chat VAN - 受け取り準備完了",
      message: method === 'invoice'
        ? "法人請求書払いの申請を受け付けました。担当者より審査結果をご連絡します。受け取り日時はレンタル会社へお電話ください。"
        : "お支払いが完了しました。レンタル会社へ連絡して車両を受け取ってください。",
    });

    // 管理者通知
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "Chat VAN - 決済完了・受け取り待ち",
        message: `決済完了（契約ID: ${id} / 支払方法: ${method === 'invoice' ? '法人請求書' : 'カード'}）。車両受け取り待ちです。`,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("pay error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/confirm-pickup  車両受け取り確認 ─────────────
router.post("/van/applications/:id/confirm-pickup", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const userId: number | undefined = (req.session as any)?.userId;
    const { pickupPhotos, pickupDocuments } = req.body as {
      pickupPhotos?: string[];
      pickupDocuments?: string[];
    };

    const userRole: string | undefined = (req.session as any)?.userRole;
    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app) return res.status(404).json({ error: "Not found" });
    const isAdmin = userRole === 'admin';
    const isOwner = app.userId === userId;
    if (!isAdmin && !isOwner) {
      // 協力会社が自社車両の場合も許可
      if (userRole === 'company') {
        const [contractForAuth] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.applicationId, appId));
        const rcRows = await db.execute(sql`SELECT rental_company_id FROM users WHERE id = ${userId} LIMIT 1`);
        const rcId = (rcRows as any).rows?.[0]?.rental_company_id ?? (rcRows as any)[0]?.rental_company_id;
        if (contractForAuth?.vehicleId && rcId) {
          const [veh] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, contractForAuth.vehicleId));
          if (veh?.rentalCompanyId !== rcId) return res.status(403).json({ error: "Forbidden" });
        } else {
          return res.status(403).json({ error: "Forbidden" });
        }
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    if (app.status !== "delivery_pending") return res.status(400).json({ error: "受け取り確認は delivery_pending 状態のみ可能です" });

    await db.update(vanApplicationsTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId));

    // 車両ステータスを貸出中に・写真/書類を保存
    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.applicationId, appId));
    if (contract) {
      await db.execute(sql`
        UPDATE van_contracts SET
          pickup_photos    = ${pickupPhotos ? JSON.stringify(pickupPhotos) : null},
          pickup_documents = ${pickupDocuments ? JSON.stringify(pickupDocuments) : null},
          updated_at = NOW()
        WHERE id = ${contract.id}
      `);
      if (contract.vehicleId) {
        await db.update(vehiclesTable)
          .set({ status: "rented", updatedAt: new Date() })
          .where(eq(vehiclesTable.id, contract.vehicleId));
      }
    }

    await db.insert(notificationsTable).values({
      userId: app.userId,
      title: "Chat VAN - 受け取り完了",
      message: "車両の受け取りが完了しました。ご利用開始です。毎月の自動決済が設定された支払日に実行されます。",
    });

    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "Chat VAN - 受け取り完了",
        message: `申込ID: ${appId} の車両受け取りが完了しました。`,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("confirm-pickup error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/request-return  解約申請 ────────────────────
router.post("/van/applications/:id/request-return", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const userId: number | undefined = (req.session as any)?.userId;
    const { reason } = req.body as { reason?: string };

    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app) return res.status(404).json({ error: "Not found" });
    if (app.userId !== userId) return res.status(403).json({ error: "Forbidden" });
    if (!["active", "payment_issue"].includes(app.status)) {
      return res.status(400).json({ error: "利用中または支払い問題の状態のみ解約申請できます" });
    }

    await db.update(vanApplicationsTable)
      .set({ status: "return_pending", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId));

    // 契約終了日 = 解約申請時点での現在の請求期間の終了日
    // start_date から1ヶ月ずつ加算し、今日より未来になる最初の日
    const contractForEnd = await db.execute(sql`SELECT start_date FROM van_contracts WHERE application_id = ${appId} LIMIT 1`);
    const startDateStr = ((contractForEnd as any).rows ?? contractForEnd)[0]?.start_date;
    if (startDateStr) {
      const startDate = new Date(startDateStr);
      const today = new Date();
      // 第1期終了日（start + 1ヶ月）から始め、今日より未来になるまで繰り上げ
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      while (endDate <= today) {
        endDate.setMonth(endDate.getMonth() + 1);
      }
      const endDateStr = endDate.toISOString().split('T')[0];
      await db.execute(sql`
        UPDATE van_contracts SET planned_end_date = ${endDateStr}, updated_at = NOW()
        WHERE application_id = ${appId}
      `);
    }

    await db.insert(notificationsTable).values({
      userId: app.userId,
      title: "Chat VAN - 解約申請を受け付けました",
      message: "解約申請を受け付けました。担当者より返却手続きのご連絡をいたします（2〜3営業日以内）。",
    });

    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "Chat VAN - 解約申請",
        message: `申込ID: ${appId} から解約申請が届きました。${reason ? `理由: ${reason}` : ""}`,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("request-return error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/confirm-return  返却確認 ──────────────────────
router.post("/van/applications/:id/confirm-return", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const userId: number | undefined = (req.session as any)?.userId;
    const { returnPhotos, returnDocuments } = req.body as {
      returnPhotos?: string[];
      returnDocuments?: string[];
    };

    const userRole2: string | undefined = (req.session as any)?.userRole;
    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app) return res.status(404).json({ error: "Not found" });
    const isAdmin2 = userRole2 === 'admin';
    const isOwner2 = app.userId === userId;
    if (!isAdmin2 && !isOwner2) {
      if (userRole2 === 'company') {
        const [contractForAuth2] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.applicationId, appId));
        const rcRows2 = await db.execute(sql`SELECT rental_company_id FROM users WHERE id = ${userId} LIMIT 1`);
        const rcId2 = (rcRows2 as any).rows?.[0]?.rental_company_id ?? (rcRows2 as any)[0]?.rental_company_id;
        if (contractForAuth2?.vehicleId && rcId2) {
          const [veh2] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, contractForAuth2.vehicleId));
          if (veh2?.rentalCompanyId !== rcId2) return res.status(403).json({ error: "Forbidden" });
        } else {
          return res.status(403).json({ error: "Forbidden" });
        }
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    if (app.status !== "return_pending") return res.status(400).json({ error: "返却確認は return_pending 状態のみ可能です" });

    await db.update(vanApplicationsTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId));

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.applicationId, appId));
    if (contract) {
      await db.execute(sql`
        UPDATE van_contracts SET
          return_photos    = ${returnPhotos ? JSON.stringify(returnPhotos) : null},
          return_documents = ${returnDocuments ? JSON.stringify(returnDocuments) : null},
          status = 'completed',
          updated_at = NOW()
        WHERE id = ${contract.id}
      `);
      if (contract.vehicleId) {
        await db.update(vehiclesTable)
          .set({ status: "available", updatedAt: new Date() })
          .where(eq(vehiclesTable.id, contract.vehicleId));
      }
    }

    await db.insert(notificationsTable).values({
      userId: app.userId,
      title: "Chat VAN - 返却完了",
      message: "車両の返却が完了しました。ご利用ありがとうございました。",
    });

    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "Chat VAN - 返却完了",
        message: `申込ID: ${appId} の車両返却が完了しました。`,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("confirm-return error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 免許証確認 ─────────────────────────────────────────────────────────────
// ── GET /van/applications/:id/related ──────────────────────────────────────
// 相談詳細画面の追加タブ用: 契約・保険・GPS・事故・審査・決済を一括取得
router.get("/van/applications/:id/related", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const appRow = await db.execute(sql`SELECT user_id FROM van_applications WHERE id = ${appId} LIMIT 1`);
    const userId = ((appRow as any)?.rows ?? appRow)[0]?.user_id;
    if (!userId) return res.status(404).json({ error: "Application not found" });

    const [contracts, incidents, screening, identityVerification] = await Promise.all([
      // 契約（この相談に紐づく1件のみ）
      db.execute(sql`
        SELECT vc.*,
          v.maker, v.model, v.license_plate, v.prefecture, v.year, v.mileage,
          v.inspection_expiry, v.has_etc, v.has_dashcam, v.has_backup_cam,
          v.photos as vehicle_photos, v.vin, v.grade, v.smoking_policy,
          v.insurance_company, v.insurance_expiry, v.compulsory_insurance_expiry,
          v.mileage_limit, v.excess_mileage_fee,
          rc.name as rental_company_name, rc.phone as rental_company_phone
        FROM van_contracts vc
        LEFT JOIN vehicles v ON vc.vehicle_id = v.id
        LEFT JOIN rental_companies rc ON v.rental_company_id = rc.id
        WHERE vc.application_id = ${appId}
        ORDER BY vc.created_at DESC
      `),
      // 事故
      db.execute(sql`
        SELECT vi.*, vc.id as contract_number,
          v.maker, v.model, v.license_plate
        FROM van_incidents vi
        LEFT JOIN van_contracts vc ON vi.contract_id = vc.id
        LEFT JOIN vehicles v ON vc.vehicle_id = v.id
        WHERE vi.user_id = ${userId}
        ORDER BY vi.created_at DESC
      `),
      // 審査
      db.execute(sql`
        SELECT s.* FROM screenings s WHERE s.application_id = ${appId} ORDER BY s.created_at DESC
      `),
      // 本人確認 — application_id優先、なければ user_id で最新のverifiedを取得
      db.execute(sql`
        SELECT * FROM identity_verifications
        WHERE application_id = ${appId}
           OR (user_id = ${userId} AND application_id IS NULL)
        ORDER BY CASE status WHEN 'verified' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
        LIMIT 1
      `),
    ]);

    const contractRows = ((contracts as any)?.rows ?? contracts) as any[];
    const contractIds = contractRows.map((c: any) => c.id).filter(Boolean);

    // 保険・GPS・決済はcontract経由
    const [insurance, gps, payments] = await Promise.all([
      contractIds.length ? db.execute(sql`
        SELECT ip.*, v.maker, v.model, v.license_plate
        FROM insurance_policies ip
        LEFT JOIN vehicles v ON ip.vehicle_id = v.id
        WHERE ip.contract_id = ANY(ARRAY[${sql.raw(contractIds.join(','))}]::int[])
        ORDER BY ip.expiry_date ASC
      `) : { rows: [] },
      contractIds.length ? db.execute(sql`
        SELECT gd.*, v.maker, v.model, v.license_plate,
          (SELECT row_to_json(gl) FROM gps_locations gl WHERE gl.gps_device_id = gd.id ORDER BY gl.recorded_at DESC LIMIT 1) as last_location
        FROM gps_devices gd
        JOIN vehicles v ON gd.vehicle_id = v.id
        WHERE v.id IN (
          SELECT vehicle_id FROM van_contracts WHERE id = ANY(ARRAY[${sql.raw(contractIds.join(','))}]::int[])
        )
      `) : { rows: [] },
      contractIds.length ? db.execute(sql`
        SELECT pr.*, vc.id as contract_number
        FROM payment_retries pr
        LEFT JOIN van_contracts vc ON pr.contract_id = vc.id
        WHERE pr.contract_id = ANY(ARRAY[${sql.raw(contractIds.join(','))}]::int[])
        ORDER BY pr.attempted_at DESC
      `) : { rows: [] },
    ]);

    // 請求書（invoicesはcontract_id未保持のためuser_id紐付け）
    const invoices = await db.execute(sql`
      SELECT * FROM invoices WHERE user_id = ${userId} ORDER BY created_at DESC
    `);

    // ユーザー位置情報（最新50件）
    const userLocations = await db.execute(sql`
      SELECT id, latitude, longitude, accuracy, contract_id, recorded_at
      FROM user_locations
      WHERE user_id = ${userId}
      ORDER BY recorded_at DESC
      LIMIT 50
    `);

    const toR = (r: any) => r?.rows ?? (Array.isArray(r) ? r : []);

    // ユーザーのカード on file 情報
    const userCardRow = await db.execute(sql`
      SELECT square_card_id, square_customer_id, card_brand, card_last4 FROM users WHERE id = ${userId} LIMIT 1
    `);
    const userCard: any = ((userCardRow as any)?.rows ?? userCardRow)[0] ?? {};

    return res.json({
      contracts: toR(contracts),
      insurance: toR(insurance),
      gps: toR(gps),
      userLocations: toR(userLocations),
      incidents: toR(incidents),
      screening: toR(screening),
      identityVerification: toR(identityVerification)[0] ?? null,
      payments: toR(payments),
      invoices: toR(invoices),
      userCard: {
        hasCardOnFile: !!(userCard.square_card_id && userCard.square_customer_id),
        brand: userCard.card_brand ?? null,
        last4: userCard.card_last4 ?? null,
      },
    });
  } catch (err) {
    console.error("related data error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Helper: verify application ownership ───────────────────────────────────
async function getOwnedApplication(appId: number, userId: number | undefined, isAdmin: boolean) {
  if (!userId) return null;
  const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId)).limit(1);
  if (!app) return null;
  // Admin may access any application; regular users only their own
  if (!isAdmin && app.userId !== userId) return null;
  return app;
}

// ── Validate that a path is within the expected private objects namespace ───
function isValidObjectPath(path: string | undefined): boolean {
  if (!path) return false;
  return /^\/objects\/[a-zA-Z0-9/_\-]+$/.test(path);
}

router.get("/van/applications/:id/identity-verification", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const userId: number | undefined = (req.session as any)?.userId;
    const isAdmin = (req.session as any)?.userRole === 'admin';

    const app = await getOwnedApplication(appId, userId, isAdmin);
    if (!app) return res.status(404).json({ error: "Not found" });

    res.set("Cache-Control", "no-store");

    // application_id で検索、なければ user_id で最新の verified 記録を取得（eKYC スキップ）
    let result: any = null;
    const [byApp] = await db.select().from(identityVerificationsTable)
      .where(eq(identityVerificationsTable.applicationId, appId)).limit(1);
    if (byApp) {
      result = byApp;
    } else {
      const rows = await db.execute(sql`
        SELECT * FROM identity_verifications
        WHERE user_id = ${app.userId}
          AND status = 'verified'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      result = ((rows as any)?.rows ?? rows)[0] ?? null;

      // 既存 verified 記録でスキップ且つ application_received のまま → AI 審査を起動
      if (result && app.status === "application_received") {
        setImmediate(() => runAIScreening(appId));
      }
    }
    return res.json(result ?? null);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/applications/:id/identity-verification", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const userId: number | undefined = (req.session as any)?.userId;
    const isAdmin = (req.session as any)?.userRole === 'admin';

    // Ownership: regular users may only submit for their own application
    const app = await getOwnedApplication(appId, userId, isAdmin);
    if (!app) return res.status(404).json({ error: "Not found" });

    const b = req.body;

    // Validate uploaded document paths are in the private objects namespace
    const pathsToCheck = [b.license_front, b.license_back, ...(b.selfie_photo ? [b.selfie_photo] : [])];
    if (!isValidObjectPath(b.license_front) || !isValidObjectPath(b.license_back)) {
      return res.status(400).json({ error: "Invalid document path" });
    }
    if (b.selfie_photo && !isValidObjectPath(b.selfie_photo)) {
      return res.status(400).json({ error: "Invalid selfie path" });
    }

    // Verify upload ownership — all paths must have been issued to this user
    const claimRows = await db.execute(sql`
      SELECT object_path FROM upload_claims
      WHERE object_path IN (${b.license_front}, ${b.license_back}${b.selfie_photo ? sql`, ${b.selfie_photo}` : sql``})
        AND user_id = ${userId!}
        AND content_type LIKE 'image/%'
    `);
    const claimedPaths = new Set(((claimRows as any)?.rows ?? claimRows).map((r: any) => r.object_path));
    if (!claimedPaths.has(b.license_front) || !claimedPaths.has(b.license_back)) {
      return res.status(403).json({ error: "Document paths not authorized for this user" });
    }

    // Upsert: update existing record if already submitted/rejected; insert if none
    const existing = await db.select({ id: identityVerificationsTable.id })
      .from(identityVerificationsTable)
      .where(and(
        eq(identityVerificationsTable.userId, userId!),
        eq(identityVerificationsTable.applicationId, appId),
      )).limit(1);

    let result;
    if (existing.length > 0) {
      [result] = await db.update(identityVerificationsTable).set({
        fullName: b.full_name, birthDate: b.birth_date, address: b.address, phone: b.phone,
        email: b.email, licenseFront: b.license_front, licenseBack: b.license_back,
        licenseExpiry: b.license_expiry, licenseType: b.license_type, licenseNumber: b.license_number,
        emergencyContactName: b.emergency_contact_name ?? null,
        emergencyContactPhone: b.emergency_contact_phone ?? null,
        emergencyContactRelation: b.emergency_contact_relation ?? null,
        status: 'submitted' as any, rejectionReason: null, updatedAt: new Date(),
      }).where(eq(identityVerificationsTable.id, existing[0].id)).returning();
      if (b.selfie_photo) {
        await db.execute(sql`UPDATE identity_verifications SET selfie_photo = ${b.selfie_photo} WHERE id = ${existing[0].id}`);
      }
    } else {
      [result] = await db.insert(identityVerificationsTable).values({
        userId: userId!,
        applicationId: appId,
        fullName: b.full_name, birthDate: b.birth_date, address: b.address, phone: b.phone,
        email: b.email, licenseFront: b.license_front, licenseBack: b.license_back,
        licenseExpiry: b.license_expiry, licenseType: b.license_type, licenseNumber: b.license_number,
        emergencyContactName: b.emergency_contact_name ?? null,
        emergencyContactPhone: b.emergency_contact_phone ?? null,
        emergencyContactRelation: b.emergency_contact_relation ?? null,
        status: 'submitted',
      }).returning();
      if (b.selfie_photo) {
        await db.execute(sql`UPDATE identity_verifications SET selfie_photo = ${b.selfie_photo} WHERE id = ${(result as any).id}`);
      }
    }

    // Mark all uploaded paths as used
    const allPaths = [b.license_front, b.license_back, ...(b.selfie_photo ? [b.selfie_photo] : [])];
    for (const p of allPaths) {
      await db.execute(sql`UPDATE upload_claims SET used_at = NOW() WHERE object_path = ${p} AND user_id = ${userId!}`);
    }

    // Notify admin
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id, title: 'Chat VAN - 免許証提出',
        message: `免許証の確認依頼が届きました（相談ID: ${appId}）`,
      });
    }

    // eKYC AI自動判定をバックグラウンドで実行
    setImmediate(() => runAIeKYC(result.id, {
      fullName: b.full_name, birthDate: b.birth_date,
      licenseNumber: b.license_number, licenseExpiry: b.license_expiry,
      licenseType: b.license_type,
      licenseFront: b.license_front, licenseBack: b.license_back,
      selfiePhoto: b.selfie_photo,
      userId: userId!, applicationId: appId,
    }));

    return res.status(201).json(result);
  } catch (err) {
    console.error("submit id verification error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// GET /van/my/identity-verification — ログイン中ユーザーの本人確認ステータス
router.get("/van/my/identity-verification", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: number | undefined = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const [result] = await db.select().from(identityVerificationsTable)
      .where(eq(identityVerificationsTable.userId, userId))
      .orderBy(desc(identityVerificationsTable.createdAt)).limit(1);
    return res.json(result ?? null);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// GET /van/my/applications — ログイン中ユーザーの相談一覧（最新順）
router.get("/van/my/applications", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: number | undefined = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const apps = await db.select().from(vanApplicationsTable)
      .where(eq(vanApplicationsTable.userId, userId))
      .orderBy(desc(vanApplicationsTable.createdAt)).limit(10);
    return res.json(apps);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/van/identity-verifications/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { status, rejection_reason, notes } = req.body;
    const adminId: number | undefined = (req.session as any)?.userId;
    const [result] = await db.update(identityVerificationsTable).set({
      status: status as any,
      rejectionReason: rejection_reason,
      notes,
      verifiedBy: adminId,
      verifiedAt: status === 'verified' ? new Date() : undefined,
      updatedAt: new Date(),
    }).where(eq(identityVerificationsTable.id, id)).returning();
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json(result);
  } catch (err) {
    console.error("update id verification error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 保険管理 ───────────────────────────────────────────────────────────────
router.get("/van/insurance-policies", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { vehicleId, contractId } = req.query;
    const rows = await db.select({
      policy: insurancePoliciesTable,
      maker: vehiclesTable.maker,
      model: vehiclesTable.model,
      licensePlate: vehiclesTable.licensePlate,
    }).from(insurancePoliciesTable)
      .leftJoin(vehiclesTable, eq(insurancePoliciesTable.vehicleId, vehiclesTable.id))
      .where(and(
        vehicleId ? eq(insurancePoliciesTable.vehicleId, parseInt(vehicleId as string)) : undefined,
        contractId ? eq(insurancePoliciesTable.contractId, parseInt(contractId as string)) : undefined,
      ))
      .orderBy(insurancePoliciesTable.expiryDate);
    return res.json(rows.map(r => ({ ...r.policy, maker: r.maker, model: r.model, license_plate: r.licensePlate })));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/insurance-policies", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const [result] = await db.insert(insurancePoliciesTable).values({
      vehicleId: b.vehicle_id ? parseInt(b.vehicle_id) : undefined,
      contractId: b.contract_id ? parseInt(b.contract_id) : undefined,
      insuranceCompany: b.insurance_company,
      policyNumber: b.policy_number,
      startDate: b.start_date,
      expiryDate: b.expiry_date,
      bodilyInjury: b.bodily_injury,
      propertyDamage: b.property_damage,
      vehicleCoverage: b.vehicle_coverage,
      personalInjury: b.personal_injury,
      deductible: b.deductible,
      driverConditions: b.driver_conditions,
      ageConditions: b.age_conditions,
      commercialUseAllowed: b.commercial_use_allowed ?? false,
      policyDocument: b.policy_document,
      status: 'active',
      notes: b.notes,
    }).returning();
    return res.status(201).json(result);
  } catch (err) {
    console.error("create insurance error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/van/insurance-policies/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const b = req.body;
    const [result] = await db.update(insurancePoliciesTable).set({
      insuranceCompany: b.insurance_company,
      policyNumber: b.policy_number,
      expiryDate: b.expiry_date,
      commercialUseAllowed: b.commercial_use_allowed,
      status: b.status as any,
      notes: b.notes,
      updatedAt: new Date(),
    }).where(eq(insurancePoliciesTable.id, id)).returning();
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── ユーザー位置情報 POST /van/location ────────────────────────────────────
router.post("/van/location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: number | undefined = (req.session as any)?.userId;
    const { latitude, longitude, accuracy, contractId } = req.body as {
      latitude: number; longitude: number; accuracy?: number; contractId?: number;
    };
    if (latitude == null || longitude == null) return res.status(400).json({ error: "latitude/longitude required" });

    // gps_consent 確認
    if (contractId) {
      const consentRow = await db.execute(sql`
        SELECT gps_consent FROM van_contracts WHERE id = ${contractId} AND user_id = ${userId} LIMIT 1
      `);
      const row = ((consentRow as any)?.rows ?? consentRow)[0];
      if (!row?.gps_consent) return res.status(403).json({ error: "GPS consent not granted" });
    }

    await db.execute(sql`
      INSERT INTO user_locations (user_id, contract_id, latitude, longitude, accuracy, recorded_at)
      VALUES (${userId}, ${contractId ?? null}, ${String(latitude)}, ${String(longitude)}, ${accuracy ?? null}, NOW())
    `);
    return res.json({ ok: true });
  } catch (err) {
    console.error("location post error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GPS ────────────────────────────────────────────────────────────────────
router.get("/van/gps-devices", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const raw = await db.execute(sql`
      SELECT gd.*, v.maker, v.model, v.license_plate, v.prefecture,
        (SELECT row_to_json(gl) FROM gps_locations gl WHERE gl.gps_device_id = gd.id ORDER BY gl.recorded_at DESC LIMIT 1) as last_location
      FROM gps_devices gd
      LEFT JOIN vehicles v ON gd.vehicle_id = v.id
      ORDER BY gd.created_at DESC
    `);
    return res.json((raw as any).rows ?? raw);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/gps-devices", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const [result] = await db.insert(gpsDevicesTable).values({
      vehicleId: b.vehicle_id ? parseInt(b.vehicle_id) : undefined,
      provider: b.provider,
      deviceIdentifier: b.device_identifier,
      status: 'active',
      installedAt: b.installed_at ? new Date(b.installed_at) : undefined,
      notes: b.notes,
    }).returning();
    return res.status(201).json(result);
  } catch (err) {
    console.error("create gps device error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/gps-devices/:id/location", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deviceId = parseInt(String(req.params.id));
    const { latitude, longitude, address, ignition_status, mileage, battery, speed } = req.body;
    const [result] = await db.insert(gpsLocationsTable).values({
      gpsDeviceId: deviceId,
      latitude: latitude?.toString(),
      longitude: longitude?.toString(),
      address,
      ignitionStatus: ignition_status as any,
      mileage: mileage?.toString(),
      battery: battery?.toString(),
      speed: speed?.toString(),
    }).returning();
    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/van/vehicles/:id/location", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const vehicleId = parseInt(String(req.params.id));
    const raw = await db.execute(sql`
      SELECT gl.*, gd.provider, gd.device_identifier
      FROM gps_locations gl
      JOIN gps_devices gd ON gl.gps_device_id = gd.id
      WHERE gd.vehicle_id = ${vehicleId}
      ORDER BY gl.recorded_at DESC LIMIT 1
    `);
    const location = (raw as any).rows?.[0] ?? (raw as any)[0];
    return res.json(location ?? null);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 事故・故障 AI一次受付 ──────────────────────────────────────────────────
const BREAKDOWN_PROMPT = `あなたはChat VANのAIサポートです。ユーザーから故障の報告を受けています。
以下を順番に確認してください：
1. 症状（どんな異常が起きているか）
2. 警告灯の有無
3. 発生日時
4. 現在地（住所または目印）
5. 自走可能か

1〜2項目ずつ確認し、全て揃ったら以下のタグで出力してください：
<breakdown_info>{"symptom":"症状","warning_lights":"なし/あり（詳細）","occurred_at":"日時","location":"場所","can_drive":true/false}</breakdown_info>

注意：Chat VANは情報受付と連絡のみを行います。実際の修理はレンタル会社が対応します。`;

router.post("/van/breakdowns", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId, message } = req.body;
    const userId: number | undefined = (req.session as any)?.userId;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: BREAKDOWN_PROMPT }, { role: "user", content: message }],
    });
    const aiText = completion.choices[0]?.message?.content ?? "";

    // Parse breakdown info if complete
    const infoMatch = aiText.match(/<breakdown_info>([\s\S]*?)<\/breakdown_info>/);
    let breakdownId = null;
    if (infoMatch) {
      try {
        const info = JSON.parse(infoMatch[1]);
        const [bd] = await db.insert(breakdownsTable).values({
          contractId: contractId ? parseInt(contractId) : undefined,
          userId: userId!,
          symptom: info.symptom,
          warningLights: info.warning_lights,
          occurredAt: info.occurred_at,
          location: info.location,
          canDrive: info.can_drive,
          userComment: message,
          status: 'reported',
        }).returning();
        breakdownId = bd?.id;

        // Notify admin
        const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
        for (const admin of admins) {
          await db.insert(notificationsTable).values({
            userId: admin.id, title: '⚠️ Chat VAN - 故障報告',
            message: `故障が報告されました。症状: ${info.symptom}`,
          });
        }
      } catch {}
    }

    const cleanResponse = aiText.replace(/<breakdown_info>[\s\S]*?<\/breakdown_info>/g, "").trim();
    return res.json({ aiMessage: cleanResponse, isComplete: !!infoMatch, breakdownId });
  } catch (err) {
    console.error("breakdown error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/van/breakdowns", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const raw = await db.execute(sql`
      SELECT b.*, u.name as user_name, u.phone as user_phone, vc.id as contract_no
      FROM breakdowns b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN van_contracts vc ON b.contract_id = vc.id
      ORDER BY b.created_at DESC LIMIT 50
    `);
    return res.json((raw as any).rows ?? raw);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 未払い督促 ─────────────────────────────────────────────────────────────
// POST /van/payments/failure  Square Webhook または手動で呼び出し
router.post("/van/payments/failure", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { contractId, amount, periodMonth, failureReason } = req.body;

    // 再試行記録
    const [ctForRetry] = await db.select({ userId: vanContractsTable.userId })
      .from(vanContractsTable).where(eq(vanContractsTable.id, contractId)).limit(1);
    if (ctForRetry?.userId) {
      await db.insert(paymentRetriesTable).values({
        contractId, userId: ctForRetry.userId, periodMonth, amount,
        attemptNumber: 1, result: 'failed', failureReason,
      });
    }

    // 契約を payment_issue に更新
    const [contract] = await db.update(vanContractsTable)
      .set({ status: "payment_issue" as any, updatedAt: new Date() })
      .where(eq(vanContractsTable.id, contractId)).returning();

    // ユーザーへ通知
    if (contract?.userId) {
      await db.insert(notificationsTable).values({
        userId: contract.userId, title: '⚠️ 決済エラー',
        message: `${periodMonth}分の月額料金の決済に失敗しました。お支払い方法をご確認ください。`,
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("payment failure error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/van/payment-issues", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const raw = await db.execute(sql`
      SELECT vc.*, u.name as user_name, u.phone, u.email,
        v.maker, v.model, v.license_plate,
        (SELECT json_agg(pr ORDER BY pr.attempted_at DESC) FROM payment_retries pr WHERE pr.contract_id = vc.id) as retries
      FROM van_contracts vc
      LEFT JOIN users u ON vc.user_id = u.id
      LEFT JOIN vehicles v ON vc.vehicle_id = v.id
      WHERE vc.status = 'payment_issue'
      ORDER BY vc.updated_at DESC
    `);
    return res.json((raw as any).rows ?? raw);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 車両回収サポート ───────────────────────────────────────────────────────
router.get("/van/recovery-cases", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const raw = await db.execute(sql`
      SELECT rc.*, u.name as user_name, u.phone, u.email,
        v.maker, v.model, v.license_plate, v.prefecture
      FROM recovery_cases rc
      LEFT JOIN users u ON rc.user_id = u.id
      LEFT JOIN vehicles v ON rc.vehicle_id = v.id
      ORDER BY rc.created_at DESC
    `);
    return res.json((raw as any).rows ?? raw);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/recovery-cases", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const [result] = await db.insert(recoveryCasesTable).values({
      contractId: parseInt(b.contract_id),
      userId: parseInt(b.user_id),
      vehicleId: parseInt(b.vehicle_id),
      returnDeadline: b.return_deadline,
      status: 'contacting',
      notes: b.notes,
    }).returning();
    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/van/recovery-cases/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const b = req.body;
    const [result] = await db.update(recoveryCasesTable).set({
      status: b.status as any,
      contactHistory: b.contact_history,
      gpsLastLocation: b.gps_last_location,
      recoveryProvider: b.recovery_provider,
      recoveryRequestedAt: b.recovery_requested_at ? new Date(b.recovery_requested_at) : undefined,
      notes: b.notes,
      updatedAt: new Date(),
    }).where(eq(recoveryCasesTable.id, id)).returning();
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// GPS報告書生成（回収サポート用）
router.get("/van/recovery-cases/:id/gps-report", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const raw = await db.execute(sql`
      SELECT rc.*, u.name as user_name, u.phone,
        v.maker, v.model, v.license_plate,
        (SELECT row_to_json(gl) FROM gps_locations gl JOIN gps_devices gd ON gl.gps_device_id = gd.id WHERE gd.vehicle_id = rc.vehicle_id ORDER BY gl.recorded_at DESC LIMIT 1) as last_gps
      FROM recovery_cases rc
      LEFT JOIN users u ON rc.user_id = u.id
      LEFT JOIN vehicles v ON rc.vehicle_id = v.id
      WHERE rc.id = ${id}
    `);
    const rc = (raw as any).rows?.[0] ?? (raw as any)[0];
    if (!rc) return res.status(404).json({ error: "Not found" });

    const report = {
      reportTitle: "車両GPS位置確認報告書",
      generatedAt: new Date().toISOString(),
      caseId: id,
      vehicle: { maker: (rc as any).maker, model: (rc as any).model, licensePlate: (rc as any).license_plate },
      user: { name: (rc as any).user_name, phone: (rc as any).phone },
      lastGps: (rc as any).last_gps,
      returnDeadline: (rc as any).return_deadline,
      status: (rc as any).status,
      notes: "本報告書はChat VAN（SIN JAPAN株式会社）が回収サポートのために作成しました。",
    };
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 協力会社アカウント招待 ─────────────────────────────────────────────────
router.post("/van/rental-companies/:id/invite", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const rcId = parseInt(String(req.params.id));
    const [company] = await db.select().from(rentalCompaniesTable).where(eq(rentalCompaniesTable.id, rcId)).limit(1);
    if (!company) return res.status(404).json({ error: "Not found" });

    const inviteEmail = req.body.email || company.email;
    if (!inviteEmail) return res.status(400).json({ error: "メールアドレスを指定してください" });

    // 既存ユーザーに権限付与
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, inviteEmail)).limit(1);
    if (existing) {
      await db.execute(sql`UPDATE users SET role = 'rental_company', rental_company_id = ${rcId} WHERE id = ${existing.id}`);
      return res.json({ message: "既存アカウントに協力会社権限を付与しました", userId: existing.id, email: inviteEmail });
    }

    // 新規ユーザー作成
    const bcrypt = await import("bcryptjs");
    const chars = "abcdefghijkmnpqrstuvwxyz23456789";
    const tempPassword = req.body.password ||
      Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const raw = await db.execute(sql`
      INSERT INTO users (email, password_hash, name, role, rental_company_id)
      VALUES (${inviteEmail}, ${passwordHash}, ${req.body.name ?? company.name}, 'rental_company', ${rcId})
      RETURNING id, email, name
    `);
    const newUser = (raw as any).rows?.[0] ?? (raw as any)[0];
    return res.status(201).json({
      message: "アカウントを作成しました",
      userId: newUser?.id,
      email: inviteEmail,
      tempPassword,
    });
  } catch (err) {
    console.error("invite error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/users  管理者によるユーザー新規作成
router.post("/users", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, password, companyName, phone, role, preferredPaymentMethod } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name・email・passwordは必須です" });

    const existing = await db.execute(sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`);
    if (((existing as any)?.rows ?? existing).length > 0) {
      return res.status(409).json({ error: "このメールアドレスは既に使用されています" });
    }

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);

    const raw = await db.execute(sql`
      INSERT INTO users (email, password_hash, name, company_name, phone, role, preferred_payment_method, created_at)
      VALUES (
        ${email}, ${passwordHash}, ${name},
        ${companyName ?? null}, ${phone ?? null},
        ${role ?? 'user'},
        ${preferredPaymentMethod ?? 'card'},
        NOW()
      )
      RETURNING id, email, name, company_name, phone, role, created_at
    `);
    const user = ((raw as any)?.rows ?? raw)[0];
    return res.status(201).json(user);
  } catch (err) {
    console.error("create user error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /van/vehicles/parse-shaken  車検証 OCR → 車両情報を抽出
router.post("/van/vehicles/parse-shaken", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
          { type: "text", text: `この画像は日本の自動車検査証（車検証）です。以下のキーのJSONを返してください。読み取れない値はnullにしてください。
{
  "licensePlate": "登録番号（例: 横浜300あ1234）",
  "maker": "メーカー名（車名）",
  "model": "車種・型式（例: エブリイ）",
  "grade": "グレード",
  "vin": "車台番号",
  "year": "初度登録年（西暦の整数）",
  "engineDisplacement": "排気量（例: 660cc）",
  "fuelType": "燃料種類（例: ガソリン）",
  "transmission": "変速機（例: AT、MT）",
  "color": "車体色",
  "inspectionExpiry": "車検満了日（YYYY-MM-DD形式）",
  "inspectionCertificateOwner": "所有者の氏名または名称",
  "inspectionCertificateUser": "使用者の氏名または名称（所有者と同じ場合はnull）"
}
JSONのみ返してください。` }
        ]
      }],
      max_tokens: 600,
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(422).json({ error: "OCR結果を解析できませんでした" });
    return res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error("parse-shaken error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Rental Companies ───────────────────────────────────────────────────────
router.get("/van/rental-companies", requireAuth, async (req: Request, res: Response) => {
  try {
    const companies = await db.select({ company: rentalCompaniesTable, vehicleCount: sql<number>`count(${vehiclesTable.id})` })
      .from(rentalCompaniesTable)
      .leftJoin(vehiclesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .groupBy(rentalCompaniesTable.id).orderBy(rentalCompaniesTable.name);
    return res.json(companies.map(({ company, vehicleCount }) => ({ ...company, vehicleCount: Number(vehicleCount) })));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/rental-companies", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const [company] = await db.insert(rentalCompaniesTable).values(req.body).returning();
    return res.status(201).json(company);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/van/rental-companies/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const [company] = await db.select().from(rentalCompaniesTable).where(eq(rentalCompaniesTable.id, id));
    if (!company) return res.status(404).json({ error: "Not found" });
    return res.json(company);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/van/rental-companies/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db.update(rentalCompaniesTable).set(req.body).where(eq(rentalCompaniesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/van/rental-companies/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(rentalCompaniesTable).where(eq(rentalCompaniesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /van/rental-companies/:id/status ── 管理者ステータス変更 ──────────
router.patch("/van/rental-companies/:id/status", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { status, notes } = req.body as { status: string; notes?: string };
    const valid = ["prospect", "reviewing", "active", "suspended", "terminated"];
    if (!valid.includes(status)) return res.status(400).json({ error: "無効なステータスです" });

    const [updated] = await db.update(rentalCompaniesTable)
      .set({ status: status as any, ...(notes !== undefined ? { notes } : {}), updatedAt: new Date() })
      .where(eq(rentalCompaniesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "会社が見つかりません" });

    const msgs: Record<string, { title: string; message: string }> = {
      active:     { title: "審査が通過しました",       message: "Chat VANパートナー審査が通過しました。ポータルへのアクセスが有効になりました。" },
      reviewing:  { title: "審査中です",              message: "登録申請を受け付けました。審査中ですのでしばらくお待ちください。" },
      suspended:  { title: "アカウントを停止しました", message: "アカウントが一時停止されました。詳細はSIN JAPANにお問い合わせください。" },
      terminated: { title: "契約が終了しました",       message: "Chat VANパートナー契約が終了しました。" },
    };
    const msg = msgs[status];
    if (msg) {
      const raw = await db.execute(sql`SELECT id FROM users WHERE rental_company_id = ${id}`);
      const rows = (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
      for (const u of rows) {
        await db.insert(notificationsTable).values({ userId: (u as any).id, title: msg.title, message: msg.message });
      }
    }
    return res.json(updated);
  } catch (err) {
    console.error("rental-company status error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/vehicles/:id/review ── 管理者が車両を審査 ──────────────────────
router.post("/van/vehicles/:id/review", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const vehicleId = parseInt(String(req.params.id));
    const { action, reason } = req.body as { action: "approve" | "reject"; reason?: string };
    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({ error: "action は approve または reject のみ有効です" });
    }
    const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicleId));
    if (!vehicle) return res.status(404).json({ error: "車両が見つかりません" });

    const newStatus = action === "approve" ? "available" : "unavailable";
    const [updated] = await db.update(vehiclesTable).set({
      status: newStatus as any,
      ...(action === "reject" && reason ? { notes: reason } : {}),
      updatedAt: new Date(),
    }).where(eq(vehiclesTable.id, vehicleId)).returning();

    if (vehicle.rentalCompanyId) {
      const raw = await db.execute(sql`SELECT id FROM users WHERE rental_company_id = ${vehicle.rentalCompanyId}`);
      const rows = (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
      const title = action === "approve" ? "車両が承認されました" : "車両が却下されました";
      const message = action === "approve"
        ? `${vehicle.maker} ${vehicle.model} が承認されました。マッチングに使用されます。`
        : `${vehicle.maker} ${vehicle.model} が却下されました。理由: ${reason ?? "なし"}`;
      for (const u of rows) {
        await db.insert(notificationsTable).values({ userId: (u as any).id, title, message });
      }
    }
    return res.json(updated);
  } catch (err) {
    console.error("vehicle review error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Vehicles ───────────────────────────────────────────────────────────────
router.get("/van/vehicles", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, prefecture, rentalCompanyId } = req.query as Record<string, string>;
    const rows = await db.select({ vehicle: vehiclesTable, company: rentalCompaniesTable })
      .from(vehiclesTable)
      .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .where(and(
        status ? eq(vehiclesTable.status, status as any) : undefined,
        prefecture ? eq(vehiclesTable.prefecture, prefecture) : undefined,
        rentalCompanyId ? eq(vehiclesTable.rentalCompanyId, parseInt(rentalCompanyId)) : undefined,
      ))
      .orderBy(desc(vehiclesTable.createdAt));
    return res.json(rows.map(({ vehicle, company }) => ({
      ...vehicle,
      userPrice: Number(vehicle.monthlyPrice) + Number(vehicle.sinJapanFee ?? 0) + Number(vehicle.insuranceFee ?? 0),
      rentalCompany: company,
    })));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/vehicles", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const [vehicle] = await db.insert(vehiclesTable).values(req.body).returning();
    return res.status(201).json(vehicle);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/van/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const [row] = await db.select({ vehicle: vehiclesTable, company: rentalCompaniesTable })
      .from(vehiclesTable)
      .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .where(eq(vehiclesTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({
      ...row.vehicle,
      userPrice: Number(row.vehicle.monthlyPrice) + Number(row.vehicle.sinJapanFee ?? 0) + Number(row.vehicle.insuranceFee ?? 0),
      rentalCompany: row.company,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/van/vehicles/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const b = req.body as any;
    // スキーマに存在するカラムのみを渡す（ネストオブジェクト等は除外）
    const allowed: Record<string, any> = {};
    const fields = [
      'rentalCompanyId','maker','model','grade','year','vin','licensePlate',
      'blackNumberStatus','mileage','inspectionExpiry','compulsoryInsuranceExpiry',
      'insuranceExpiry','prefecture','locationDetail','gpsDeviceId','smokingPolicy',
      'hasEtc','hasDashcam','hasBackupCam','availableFrom','minPeriodMonths',
      'maxPeriodMonths','mileageLimit','excessMileageFee','monthlyPrice',
      'sinJapanFee','insuranceFee','photos','notes','status',
      'inspectionCertificateOwner','inspectionCertificateUser',
      'insuranceCompany','insurancePolicyNumber','insuranceContact',
    ] as const;
    for (const f of fields) {
      if (b[f] !== undefined) allowed[f] = b[f];
      // snake_case → camelCase のフォールバック
      const snake = f.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
      if (b[snake] !== undefined && allowed[f] === undefined) allowed[f] = b[snake];
    }
    const [updated] = await db.update(vehiclesTable).set(allowed).where(eq(vehiclesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err: any) {
    console.error('PATCH /van/vehicles error:', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
});

router.delete("/van/vehicles/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(vehiclesTable).where(eq(vehiclesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── マイグレーション ───────────────────────────────────────────────────────
db.execute(sql`ALTER TABLE identity_verifications ADD COLUMN IF NOT EXISTS selfie_photo TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS pickup_address TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS pickup_datetime TIMESTAMPTZ`).catch(() => {});
db.execute(sql`ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS pickup_photos TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS pickup_documents TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS black_number_requested BOOLEAN DEFAULT false`).catch(() => {});
db.execute(sql`ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS insurance_referral_requested BOOLEAN DEFAULT false`).catch(() => {});
db.execute(sql`ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS gps_consent BOOLEAN DEFAULT false`).catch(() => {});
db.execute(sql`ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS options_fee NUMERIC(10,2) DEFAULT 0`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS inspection_certificate_owner TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS inspection_certificate_user TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_company TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_contact TEXT`).catch(() => {});
db.execute(sql`
  CREATE TABLE IF NOT EXISTS user_locations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    contract_id INTEGER,
    latitude TEXT NOT NULL,
    longitude TEXT NOT NULL,
    accuracy NUMERIC,
    recorded_at TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {});
db.execute(sql`CREATE INDEX IF NOT EXISTS user_locations_user_id_idx ON user_locations(user_id, recorded_at DESC)`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS inspection_doc TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compulsory_insurance_doc TEXT`).catch(() => {});

// ── 月額自動決済スケジューラー (毎日 JST 9:00 = UTC 0:00) ────────────────
cron.schedule("0 0 * * *", async () => {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = jstNow.getUTCDate();
  console.log(`[月額決済] チェック開始 JST日付: ${today}日`);

  try {
    // 今日が支払日のアクティブ契約を取得
    const rows = await db
      .select({ contract: vanContractsTable, user: usersTable })
      .from(vanContractsTable)
      .leftJoin(usersTable, eq(vanContractsTable.userId, usersTable.id))
      .where(
        and(
          eq(vanContractsTable.status, "active" as any),
          sql`${vanContractsTable.paymentDay} = ${today}`
        )
      );

    console.log(`[月額決済] 対象契約: ${rows.length}件`);

    for (const { contract, user } of rows) {
      const amount = Math.floor((Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0)) * 1.1);
      const idempotencyKey = `monthly-${contract.id}-${jstNow.getUTCFullYear()}-${jstNow.getUTCMonth()}`;

      try {
        if (user?.squareCardId && user?.squareCustomerId) {
          // Square カード決済
          const squareRes = await squareFetch("/v2/payments", "POST", {
            source_id: user.squareCardId,
            amount_money: { amount: amount * 100, currency: "JPY" },
            customer_id: user.squareCustomerId,
            location_id: process.env.SQUARE_LOCATION_ID,
            idempotency_key: idempotencyKey,
          });
          const data = await squareRes.json() as any;

          if (!squareRes.ok) {
            console.error(`[月額決済] 失敗 contract=${contract.id}:`, data.errors);
            // 支払い問題ステータスに変更
            if (contract.applicationId) {
              await db.update(vanApplicationsTable)
                .set({ status: "payment_issue", updatedAt: new Date() })
                .where(eq(vanApplicationsTable.id, contract.applicationId));
            }
            await db.insert(notificationsTable).values({
              userId: contract.userId,
              title: "Chat VAN - 月額決済に失敗しました",
              message: `月額料金（¥${amount.toLocaleString()}）の決済に失敗しました。お支払い情報をご確認ください。`,
            });
          } else {
            console.log(`[月額決済] 成功 contract=${contract.id} ¥${amount}`);
            await db.insert(notificationsTable).values({
              userId: contract.userId,
              title: "Chat VAN - 月額料金のお支払いが完了しました",
              message: `月額料金（¥${amount.toLocaleString()}）のお支払いが完了しました。`,
            });
          }
        } else {
          // 請求書払い → invoices テーブルにレコード作成 + 管理者通知
          console.log(`[月額決済] 請求書払い contract=${contract.id} ¥${amount}`);
          const now = new Date();
          const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const periodEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
          const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          const invoiceNumber = `INV-${contract.id}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
          const subtotal = amount;
          const tax = Math.floor(subtotal * 0.1);
          const totalAmount = subtotal + tax;
          await db.execute(sql`
            INSERT INTO invoices (user_id, invoice_number, period_start, period_end, subtotal, tax, total_amount, status, due_date, created_at)
            VALUES (${contract.userId}, ${invoiceNumber}, ${periodStart}, ${periodEnd}, ${subtotal}, ${tax}, ${totalAmount}, 'pending', ${dueDate}, NOW())
            ON CONFLICT DO NOTHING
          `);
          const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
          for (const admin of admins) {
            await db.insert(notificationsTable).values({
              userId: admin.id,
              title: "Chat VAN - 月額請求書を発行してください",
              message: `契約ID: ${contract.id} / ユーザーID: ${contract.userId} への月額請求書（${invoiceNumber} / ¥${totalAmount.toLocaleString()}）を発行してください。`,
            });
          }
        }
      } catch (e) {
        console.error(`[月額決済] エラー contract=${contract.id}:`, e);
      }
    }
  } catch (e) {
    console.error("[月額決済] スケジューラーエラー:", e);
  }
}, { timezone: "UTC" });

export default router;
