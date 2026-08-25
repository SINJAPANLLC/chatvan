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
  screeningsTable,
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
import { squareFetch, getSquareConfigError } from "../lib/square-authorize";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { notifyUser, notifyAdmins, notifyRcUsers } from "../lib/notifyHelpers";
import { RC_ALLOWED_CONTRACT_STATUSES } from "../lib/rentalCompanyApplicationAccess";
import {
  getCaller,
  authorizeApplicationOwnerOrAdmin,
  authorizeContractOwnerOrAdmin,
  authorizeApplicationLifecycleActor,
  isInvoiceRequested,
  activateInvoiceContract,
} from "../lib/vanLifecycleAuth";


const objectStorage = new ObjectStorageService();

class RentalCompanyAccountEmailConflictError extends Error {}

const screeningRetryNotBefore = new Map<number, number>();
const SCREENING_TIMEOUT_MS = 45_000;
const SCREENING_RETRY_DELAY_MS = 60_000;

function scheduleAIScreening(appId: number) {
  if (Date.now() < (screeningRetryNotBefore.get(appId) ?? 0)) return;
  setImmediate(() => { void runAIScreening(appId); });
}

function parseCalendarDate(value: unknown): string | null {
  const dateString = String(value ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return dateString;
}

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
        const response = await objectStorage.downloadObjectPath(objectPath);
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
      model: "gpt-5.4-mini",
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
    await notifyUser(data.userId,
      result === "verified" ? "Chat VAN - 本人確認完了" : "Chat VAN - 本人確認 要再提出",
      result === "verified"
        ? "本人確認（eKYC）が完了しました。審査に進みます。"
        : `本人確認が確認できませんでした: ${reason}。再度アップロードしてください。`);

    // eKYC verified → AI審査を自動起動（application_received状態のまま審査が未実行の場合）
    if (result === "verified") {
      const [app] = await db.select().from(vanApplicationsTable)
        .where(eq(vanApplicationsTable.id, data.applicationId));
      if (app && app.status === "application_received") {
        scheduleAIScreening(data.applicationId);
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
    // application_received → screening の更新を取得処理として使い、同一申込の二重審査を防ぐ。
    const [app] = await db.update(vanApplicationsTable).set({
      status: "screening",
      updatedAt: new Date(),
    }).where(and(
      eq(vanApplicationsTable.id, appId),
      eq(vanApplicationsTable.status, "application_received"),
    )).returning();
    if (!app) return;

    // 審査プロンプトをDB優先で取得
    let screeningSystemPrompt = `あなたは軽バン月額レンタルサービスの申込審査AIです。\n申込データを分析し、以下のJSONのみ返してください:\n{"result": "approved" | "rejected", "reason": "理由（日本語、50文字以内）"}\n\n【審査方針】\n初めて車を借りるユーザーがほとんどのため、保険・黒ナンバー・配送経験は一切審査対象にしない。\n以下の2条件のみで判断する:\n1. 利用目的が明らかに違法（麻薬・密輸・犯罪等）でないこと\n2. 申込内容が明らかな嫌がらせ・テスト・無意味な入力でないこと\n上記に該当しない限り、必ず approved にすること。`;
    try {
      const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_screening_prompt")).limit(1);
      if (row?.value) screeningSystemPrompt = row.value;
    } catch { /* fallback */ }

    const completion = await openai.chat.completions.create(
      {
        model: "gpt-5.4-mini",
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
      },
      { timeout: SCREENING_TIMEOUT_MS },
    );

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const result: "approved" | "rejected" = parsed.result === "rejected" ? "rejected" : "approved";
    const reason: string = parsed.reason ?? "";

    // 審査結果は申込ステータスだけでなく、管理画面の履歴としても残す。
    // 同一トランザクションにして、片方だけ更新される状態を防ぐ。
    if (!app.userId) throw new Error("AI審査対象の利用者情報がありません");
    await db.transaction(async (tx) => {
      const [updatedApplication] = await tx.update(vanApplicationsTable).set({
        status: result,
        updatedAt: new Date(),
      }).where(and(
        eq(vanApplicationsTable.id, appId),
        eq(vanApplicationsTable.status, "screening"),
      )).returning({ id: vanApplicationsTable.id });
      if (!updatedApplication) return;

      await tx.insert(screeningsTable).values({
        applicationId: appId,
        userId: app.userId,
        result,
        reason: reason || null,
        notes: "AI自動審査",
      });
    });
    screeningRetryNotBefore.delete(appId);

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

              await notifyUser(app.userId!, "Chat VAN - 審査通過・契約書が届きました",
                "審査が通過しました！契約書の内容をご確認のうえ、電子署名をお願いします。");
            }
          }
        } else {
          // 提案なしの場合はシンプル通知
          await notifyUser(app.userId!, "Chat VAN - 審査通過",
            "審査が通過しました！担当者が契約書を準備しています。");
        }
      } catch (contractErr) {
        console.error("[AI Screening] 契約自動生成エラー:", contractErr);
        await notifyUser(app.userId!, "Chat VAN - 審査通過",
          "審査が通過しました！担当者が契約書を準備しています。");
      }
    } else {
      await notifyUser(app.userId!, "Chat VAN - 審査結果",
        `審査の結果、今回はお断りとさせていただきました。${reason}`);
    }
  } catch (err) {
    console.error("[AI Screening] エラー:", err);
    screeningRetryNotBefore.set(appId, Date.now() + SCREENING_RETRY_DELAY_MS);
    // 通信・AI側の一時障害で画面が永遠に止まらないよう、次回の定期更新から再試行できる状態へ戻す。
    await db.update(vanApplicationsTable).set({
      status: "application_received",
      updatedAt: new Date(),
    }).where(and(
      eq(vanApplicationsTable.id, appId),
      eq(vanApplicationsTable.status, "screening"),
    )).catch((recoveryErr) => {
      console.error("[AI Screening] 再試行状態への復旧エラー:", recoveryErr);
    });
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
      model: "gpt-5.4-mini",
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

      await notifyAdmins('Chat VAN相談',
        `新しい軽バン相談が届きました（ID: ${app.id} / ${inquiry.area} / ¥${(inquiry.monthlyBudget as number)?.toLocaleString()}/月）`);
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

function canAccessVanMessages(applicationUserId: number | null, userId: number, role: string): boolean {
  return role === "admin" || (role === "user" && applicationUserId === userId);
}

// ── GET /van/applications/:id/messages ────────────────────────────────────
router.get("/van/applications/:id/messages", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    if (!Number.isInteger(appId) || appId <= 0) {
      return res.status(400).json({ error: "Invalid application ID" });
    }

    const userId = req.session.userId;
    const role = req.session.userRole;
    if (userId === undefined || !role) {
      return res.status(401).json({ error: "認証が必要です" });
    }

    const [application] = await db.select({
      userId: vanApplicationsTable.userId,
    }).from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!application) return res.status(404).json({ error: "Application not found" });
    if (!canAccessVanMessages(application.userId, userId, role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

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
router.post("/van/applications/:id/messages", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    if (!Number.isInteger(appId) || appId <= 0) return res.status(400).json({ error: "Invalid application ID" });
    const { message } = req.body as { message: string };
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app) return res.status(404).json({ error: "Application not found" });

    const callerUserId = req.session.userId;
    const callerRole = req.session.userRole;
    if (callerUserId === undefined || !callerRole) {
      return res.status(401).json({ error: "認証が必要です" });
    }
    if (!canAccessVanMessages(app.userId, callerUserId, callerRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // ユーザー登録情報を取得
    const sessionUserId = callerUserId;
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
          await notifyUser(app.userId, "Chat VAN - 車両提案",
            "条件に合う車両をご提案しました。チャット画面をご確認ください。");
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
        COUNT(*) FILTER (
          WHERE status NOT IN ('active','completed','cancelled','rejected')
        )                                                                             AS active,
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
//
// Authorization matrix:
//   admin          – full DTO (unchanged)
//   user           – only their own application, full DTO (unchanged)
//   rental_company – ONLY if there is a van_contract for this application
//                    whose vehicle belongs to their rental company AND whose
//                    status is one of: active | payment_issue | return_pending | completed.
//                    These are the post-activation statuses, meaning the contract
//                    was explicitly executed (signed, paid, and handed over).
//                    draft / pending_* / payment_processing / cancelled are all
//                    pre-commitment or void — a company must not gain read access
//                    merely because a proposal once listed one of their vehicles.
//                    Authorised rental_company callers receive a role-scoped minimal
//                    DTO: no eKYC/identityVerification, no applicant PII, no
//                    payment-sensitive fields, no competing vehicles.
//
router.get("/van/applications/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid application ID" });

    const callerUserId = req.session.userId;
    const callerRole = req.session.userRole;
    if (callerUserId === undefined || !callerRole) {
      return res.status(401).json({ error: "認証が必要です" });
    }

    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, id));
    if (!app) return res.status(404).json({ error: "Not found" });

    // ── Authorization ─────────────────────────────────────────────────────
    if (callerRole === "admin") {
      // Admin: full access — fall through
    } else if (callerRole === "user") {
      // Regular user: only their own application
      if (app.userId !== callerUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }
    } else if (callerRole === "rental_company") {
      // Step 1: resolve the rental company that owns the caller's account.
      const rcRaw = await db.execute(
        sql`SELECT rental_company_id FROM users WHERE id = ${callerUserId} LIMIT 1`
      );
      const callerRcId: number | null =
        ((rcRaw as any).rows ?? rcRaw)[0]?.rental_company_id ?? null;

      if (!callerRcId) return res.status(403).json({ error: "Forbidden" });

      // Step 2: require an explicitly activated contract for this application
      //   whose vehicle belongs to this rental company.
      //   Conservative status set — only post-payment, genuinely live or
      //   historical contracts qualify.  A mere proposal listing their vehicle
      //   is NOT sufficient.  See lib/rentalCompanyApplicationAccess.ts for
      //   the full rationale and the allowed-status list.

      const rcContractCheck = await db.execute(
        sql`
          SELECT vc.id
          FROM van_contracts vc
          JOIN vehicles v ON v.id = vc.vehicle_id
          WHERE vc.application_id = ${id}
            AND v.rental_company_id  = ${callerRcId}
            AND vc.status = ANY(ARRAY[${sql.join(
              RC_ALLOWED_CONTRACT_STATUSES.map((s) => sql`${s}`),
              sql`, `
            )}]::text[])
          LIMIT 1
        `
      );
      const rcContractFound =
        (((rcContractCheck as any).rows ?? rcContractCheck)[0]?.id ?? null) !== null;

      if (!rcContractFound) return res.status(403).json({ error: "Forbidden" });

      // ── Rental-company scoped minimal DTO ───────────────────────────────
      // Return only fields genuinely needed for the company's workflow.
      // Intentionally excluded: applicant PII (name/phone/email/dob/address/
      // licenseInfo), identityVerification/eKYC, aiSummary, adminNotes,
      // payment/card-sensitive fields, other companies' proposed vehicles,
      // and sensitive contract internals (signatureData, specialTerms, etc.).
      const rcContractRows = await db
        .select({
          contract: {
            id:           vanContractsTable.id,
            contractNumber: vanContractsTable.contractNumber,
            status:       vanContractsTable.status,
            startDate:    vanContractsTable.startDate,
            plannedEndDate: vanContractsTable.plannedEndDate,
            vehicleId:    vanContractsTable.vehicleId,
            createdAt:    vanContractsTable.createdAt,
            updatedAt:    vanContractsTable.updatedAt,
          },
          vehicle: {
            id:            vehiclesTable.id,
            maker:         vehiclesTable.maker,
            model:         vehiclesTable.model,
            grade:         vehiclesTable.grade,
            year:          vehiclesTable.year,
            licensePlate:  vehiclesTable.licensePlate,
            color:         vehiclesTable.color,
            prefecture:    vehiclesTable.prefecture,
            mileage:       vehiclesTable.mileage,
            status:        vehiclesTable.status,
          },
        })
        .from(vanContractsTable)
        .innerJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
        .where(
          and(
            eq(vanContractsTable.applicationId, id),
            eq(vehiclesTable.rentalCompanyId, callerRcId),
            inArray(vanContractsTable.status, [...RC_ALLOWED_CONTRACT_STATUSES]),
          )
        )
        .limit(1)
        .catch(() => []);

      const rcContractRow = rcContractRows[0] ?? null;

      return res.json({
        // Minimal application fields — workflow-relevant only, no PII
        id:             app.id,
        status:         app.status,
        area:           app.area,
        prefecture:     app.prefecture,
        startDate:      app.startDate,
        durationMonths: app.durationMonths,
        deliveryType:   app.deliveryType,
        createdAt:      app.createdAt,
        updatedAt:      app.updatedAt,
        // Contract and vehicle for this company only
        contract: rcContractRow?.contract ?? null,
        vehicle:  rcContractRow?.vehicle ?? null,
      });
    } else {
      // Unknown role — deny
      return res.status(403).json({ error: "Forbidden" });
    }
    // ── End Authorization ─────────────────────────────────────────────────

    let proposedVehicles = null;
    const [proposal] = await db.select().from(vanProposalsTable)
      .where(eq(vanProposalsTable.applicationId, id))
      .orderBy(desc(vanProposalsTable.createdAt)).limit(1);

    if (proposal) {
      const parsedProposalVehicleIds: unknown = (() => { try { return JSON.parse(proposal.vehicleIds); } catch { return []; } })();
      const vehicleIds = Array.isArray(parsedProposalVehicleIds)
        ? parsedProposalVehicleIds.filter((v): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0)
        : [];
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
    const customMessage = typeof message === "string" ? message.trim() : "";

    await db.insert(vanProposalsTable).values({ applicationId: appId, vehicleIds: JSON.stringify(vehicleIds), message: customMessage || null });

    const [app] = await db.update(vanApplicationsTable)
      .set({ status: "proposed", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId)).returning();

    if (app?.userId) {
      await notifyUser(app.userId, "Chat VAN - 車両提案",
        customMessage
          ? `Chat VANから軽バンのご提案が届きました。\n\n担当者からのメッセージ:\n${customMessage}\n\nチャットをご確認ください。`
          : "Chat VANから軽バンのご提案が届きました。チャットをご確認ください。");
    }

    const vehicles = await db.select().from(vehiclesTable).where(inArray(vehiclesTable.id, vehicleIds));
    const vehicleText = vehicles.map(v =>
      `▼ ${v.maker} ${v.model}（${v.prefecture ?? ""}）\n月額: ¥${(Number(v.monthlyPrice) + Number(v.sinJapanFee ?? 0)).toLocaleString()}/月\n最低期間: ${v.minPeriodMonths}ヶ月以上\n利用可能: ${v.availableFrom ?? "即日相談可"}`
    ).join("\n\n");

    const proposalMessage = `Chat VANからのご提案です。条件に合う車両をご用意しました。\n\n${vehicleText}\n\n${customMessage}`;
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
    if (!Number.isInteger(appId)) return res.status(400).json({ error: "Invalid application id" });

    // AUTHZ: only the application owner or an admin may accept an application.
    const caller = getCaller(req);
    const authz = await authorizeApplicationOwnerOrAdmin(caller, appId);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const [app] = await db.update(vanApplicationsTable)
      .set({ status: "application_received", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId)).returning();
    if (!app) return res.status(404).json({ error: "Not found" });

    await notifyAdmins('Chat VAN - 申込受付', `申込みを受け付けました（ID: ${appId}）`);
    // 既にeKYC済みのユーザーはAI審査を即時実行
    if (app.userId) {
      const existingKyc = await db.execute(sql`
        SELECT id FROM identity_verifications
        WHERE user_id = ${app.userId} AND status = 'verified'
        LIMIT 1
      `);
      const kycRow = ((existingKyc as any)?.rows ?? existingKyc)[0];
      if (kycRow) {
        scheduleAIScreening(appId);
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

    const revenueMetricResults = await Promise.allSettled([
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
       // 黒ナンバー売上・件数（利用中・完了済み契約のみ。税込: options_fee × 1.1）
      db.execute(sql`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(ROUND(COALESCE(options_fee,0) * 1.1)),0) AS total
         FROM van_contracts
         WHERE black_number_requested = true
           AND status IN ('active', 'completed')
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
    for (const result of revenueMetricResults) {
      if (result.status === "rejected") {
        console.error("dashboard revenue metric failed:", result.reason);
      }
    }

    // リスク指標
    let openIncidents = 0, paymentFailures7d = 0, openBreakdowns = 0, pendingReturns = 0, insuranceAlerts = 0;
    const riskMetricResults = await Promise.allSettled([
       db.execute(sql`SELECT COUNT(*) AS c FROM van_incidents WHERE status = '報告受付'`)
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
    for (const result of riskMetricResults) {
      if (result.status === "rejected") {
        console.error("dashboard risk metric failed:", result.reason);
      }
    }

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
       WHERE i.status = '報告受付'
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
// ── Authorization helper: rental-company minimal contract DTO ────────────────
// Fields excluded for rental_company callers: userId, signatureData,
// specialTerms, terminationTerms, returnTerms, platformContractAgreedAt,
// vehicleContractAgreedAt, termsAgreedAt, notes, applicationId, and any
// payment/card-sensitive data (paymentMethod, paymentDay, sinJapanFee,
// optionsFee). This DTO is the single source-of-truth for both list and detail.
function rcContractDto(
  contract: typeof vanContractsTable.$inferSelect,
  vehicle: (typeof vehiclesTable.$inferSelect) | null,
) {
  return {
    id:                       contract.id,
    contractNumber:           contract.contractNumber,
    status:                   contract.status,
    startDate:                contract.startDate,
    plannedEndDate:           contract.plannedEndDate,
    minimumTerm:              contract.minimumTerm,
    monthlyPrice:             contract.monthlyPrice,
    blackNumberRequested:     contract.blackNumberRequested,
    insuranceReferralRequested: contract.insuranceReferralRequested,
    gpsConsent:               contract.gpsConsent,
    pickupAddress:            (contract as any).pickupAddress ?? null,
    pickupDatetime:           (contract as any).pickupDatetime ?? null,
    createdAt:                contract.createdAt,
    updatedAt:                contract.updatedAt,
    vehicle: vehicle
      ? {
          id:           vehicle.id,
          maker:        vehicle.maker,
          model:        vehicle.model,
          grade:        vehicle.grade,
          year:         vehicle.year,
          licensePlate: vehicle.licensePlate,
          color:        vehicle.color,
          prefecture:   vehicle.prefecture,
          mileage:      vehicle.mileage,
          status:       vehicle.status,
        }
      : null,
  };
}

// GET /van/contracts  契約一覧
// Access policy:
//   admin         — all contracts; caller-supplied userId filter is honoured
//   user          — only contracts whose userId matches the session; caller-
//                   supplied userId filter is silently ignored
//   rental_company — only contracts whose vehicle belongs to the caller's
//                   rental company AND whose lifecycle status is in the
//                   RC_ALLOWED_CONTRACT_STATUSES list; caller-supplied
//                   userId filter is silently ignored; returns minimal DTO
router.get("/van/contracts", requireAuth, async (req: Request, res: Response) => {
  try {
    const callerUserId: number = (req.session as any)?.userId;
    const callerRole: string   = (req.session as any)?.userRole ?? "user";
    const { status } = req.query as { status?: string };

    // ── Authorization & query dispatch ─────────────────────────────────────
    if (callerRole === "admin") {
      // Admin: may filter by an arbitrary userId query param (operator-level tool)
      const filterUserId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const rows = await db
        .select({ contract: vanContractsTable, vehicle: vehiclesTable, company: rentalCompaniesTable })
        .from(vanContractsTable)
        .leftJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
        .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
        .where(
          and(
            filterUserId ? eq(vanContractsTable.userId, filterUserId) : undefined,
            status ? eq(vanContractsTable.status, status as any) : undefined,
          ),
        )
        .orderBy(desc(vanContractsTable.createdAt));

      const ids = rows.map(r => r.contract.id);
      let paymentMethods: Record<number, string> = {};
      if (ids.length > 0) {
        const pmRows = await db.execute(
          sql`SELECT id, payment_method FROM van_contracts WHERE id = ANY(ARRAY[${sql.raw(ids.join(","))}]::int[])`,
        );
        for (const r of ((pmRows as any).rows ?? pmRows)) paymentMethods[r.id] = r.payment_method ?? null;
      }
      return res.json(
        rows.map(({ contract, vehicle, company }) => ({
          ...contract,
          paymentMethod: paymentMethods[contract.id] ?? null,
          vehicle: vehicle ? { ...vehicle, rentalCompany: company } : null,
        })),
      );

    } else if (callerRole === "rental_company") {
      // rental_company: look up which rental company this user belongs to first
      const rcRaw = await db.execute(
        sql`SELECT rental_company_id FROM users WHERE id = ${callerUserId} LIMIT 1`,
      );
      const callerRcId: number | null =
        ((rcRaw as any).rows ?? rcRaw)[0]?.rental_company_id ?? null;

      if (!callerRcId) return res.status(403).json({ error: "Forbidden" });

      // Query: contracts whose vehicle belongs to this company, restricted
      // to the lifecycle statuses that are relevant for company operations.
      const rows = await db
        .select({ contract: vanContractsTable, vehicle: vehiclesTable })
        .from(vanContractsTable)
        .innerJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
        .where(
          and(
            eq(vehiclesTable.rentalCompanyId, callerRcId),
            inArray(vanContractsTable.status, [...RC_ALLOWED_CONTRACT_STATUSES]),
            status ? eq(vanContractsTable.status, status as any) : undefined,
          ),
        )
        .orderBy(desc(vanContractsTable.createdAt));

      return res.json(rows.map(({ contract, vehicle }) => rcContractDto(contract, vehicle)));

    } else {
      // Regular user: only their own contracts; userId query param is ignored
      const rows = await db
        .select({ contract: vanContractsTable, vehicle: vehiclesTable, company: rentalCompaniesTable })
        .from(vanContractsTable)
        .leftJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
        .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
        .where(
          and(
            eq(vanContractsTable.userId, callerUserId),
            status ? eq(vanContractsTable.status, status as any) : undefined,
          ),
        )
        .orderBy(desc(vanContractsTable.createdAt));

      const ids = rows.map(r => r.contract.id);
      let paymentMethods: Record<number, string> = {};
      if (ids.length > 0) {
        const pmRows = await db.execute(
          sql`SELECT id, payment_method FROM van_contracts WHERE id = ANY(ARRAY[${sql.raw(ids.join(","))}]::int[])`,
        );
        for (const r of ((pmRows as any).rows ?? pmRows)) paymentMethods[r.id] = r.payment_method ?? null;
      }
      return res.json(
        rows.map(({ contract, vehicle, company }) => ({
          ...contract,
          paymentMethod: paymentMethods[contract.id] ?? null,
          vehicle: vehicle ? { ...vehicle, rentalCompany: company } : null,
        })),
      );
    }
  } catch (err) {
    req.log.error({ err }, "list contracts error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// GET /van/contracts/:id  契約詳細
// Access policy:
//   admin         — full DTO for any contract
//   user          — full DTO only if contract.userId === session userId
//   rental_company — minimal DTO only if vehicle belongs to caller's company
//                   AND contract status is in RC_ALLOWED_CONTRACT_STATUSES;
//                   returns 403 otherwise (no information leak about existence)
router.get("/van/contracts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid contract id" });

    const callerUserId: number = (req.session as any)?.userId;
    const callerRole: string   = (req.session as any)?.userRole ?? "user";

    if (callerRole === "admin") {
      // Admin: unrestricted — read then return full DTO
      const [row] = await db
        .select({ contract: vanContractsTable, vehicle: vehiclesTable, company: rentalCompaniesTable })
        .from(vanContractsTable)
        .leftJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
        .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
        .where(eq(vanContractsTable.id, id));
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json({ ...row.contract, vehicle: row.vehicle ? { ...row.vehicle, rentalCompany: row.company } : null });

    } else if (callerRole === "rental_company") {
      // Resolve rental company before touching contract data
      const rcRaw = await db.execute(
        sql`SELECT rental_company_id FROM users WHERE id = ${callerUserId} LIMIT 1`,
      );
      const callerRcId: number | null =
        ((rcRaw as any).rows ?? rcRaw)[0]?.rental_company_id ?? null;

      if (!callerRcId) return res.status(403).json({ error: "Forbidden" });

      // Single authorized read: contract exists + vehicle belongs to company +
      // status is in the allowed set — all checked atomically in one query.
      const [row] = await db
        .select({ contract: vanContractsTable, vehicle: vehiclesTable })
        .from(vanContractsTable)
        .innerJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
        .where(
          and(
            eq(vanContractsTable.id, id),
            eq(vehiclesTable.rentalCompanyId, callerRcId),
            inArray(vanContractsTable.status, [...RC_ALLOWED_CONTRACT_STATUSES]),
          ),
        );

      if (!row) return res.status(403).json({ error: "Forbidden" });

      return res.json(rcContractDto(row.contract, row.vehicle));

    } else {
      // Regular user: read first, then authorize (no info-leak: 403 if not owner)
      const [row] = await db
        .select({ contract: vanContractsTable, vehicle: vehiclesTable, company: rentalCompaniesTable })
        .from(vanContractsTable)
        .leftJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
        .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
        .where(eq(vanContractsTable.id, id));

      if (!row) return res.status(404).json({ error: "Not found" });
      if (row.contract.userId !== callerUserId) return res.status(403).json({ error: "Forbidden" });

      return res.json({ ...row.contract, vehicle: row.vehicle ? { ...row.vehicle, rentalCompany: row.company } : null });
    }
  } catch (err) {
    req.log.error({ err }, "get contract error");
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

// PATCH /van/contracts/:id/pickup  納車・受け取り日時・場所の更新（管理者）
router.patch("/van/contracts/:id/pickup", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { pickupAddress, pickupDatetime, deliveryDate, sendNotification } = req.body;
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid contract id" });
    }
    if (typeof pickupAddress !== "string") {
      return res.status(400).json({ error: "受け取り場所を入力してください" });
    }
    if (pickupDatetime != null && typeof pickupDatetime !== "string") {
      return res.status(400).json({ error: "受け取り日時の形式が正しくありません" });
    }
    if (deliveryDate != null && typeof deliveryDate !== "string") {
      return res.status(400).json({ error: "納車日の形式が正しくありません" });
    }

    const requestedAddress = pickupAddress.trim();
    const pickupDatetimeText = pickupDatetime?.trim() ?? "";
    if (pickupDatetimeText && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(pickupDatetimeText)) {
      return res.status(400).json({ error: "受け取り日時の形式が正しくありません" });
    }
    // datetime-local の値はタイムゾーンを含まないため、受け取り予定は常に日本時間として保存する。
    const pickupDate = pickupDatetimeText ? new Date(`${pickupDatetimeText}:00+09:00`) : null;
    if (pickupDate && Number.isNaN(pickupDate.getTime())) {
      return res.status(400).json({ error: "受け取り日時の形式が正しくありません" });
    }
    const deliveryDateText = deliveryDate?.trim() ?? "";
    if (deliveryDateText && !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDateText)) {
      return res.status(400).json({ error: "納車日の形式が正しくありません" });
    }
    const rows = await db.execute(sql`
      SELECT
        vc.user_id,
        vc.start_date AS delivery_date,
        u.name AS user_name,
        COALESCE(v.rental_company_id, vc.rental_company_id) AS rental_company_id,
        rc.address AS rental_company_address
      FROM van_contracts vc
      LEFT JOIN vehicles v ON vc.vehicle_id = v.id
      LEFT JOIN rental_companies rc ON rc.id = COALESCE(v.rental_company_id, vc.rental_company_id)
      LEFT JOIN users u ON vc.user_id = u.id
      WHERE vc.id = ${id}
      LIMIT 1
    `);
    const contract = ((rows as any)?.rows ?? rows)[0] as {
      user_id?: number;
      user_name?: string | null;
      delivery_date?: string | null;
      rental_company_id?: number | null;
      rental_company_address?: string | null;
    } | undefined;
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    // 空欄で保存すると、契約ごとの上書きを解除して協力会社所在地へ戻せる。
    const effectivePickupAddress = requestedAddress || contract.rental_company_address?.trim() || "";
    // 納車日と受け取り日時は同一予定として扱う。旧クライアントから
    // deliveryDate だけ送られた場合のみ、後方互換としてその日付を利用する。
    const effectiveDeliveryDate = pickupDatetimeText
      ? pickupDatetimeText.slice(0, 10)
      : Object.prototype.hasOwnProperty.call(req.body, "deliveryDate")
        ? deliveryDateText || null
        : contract.delivery_date ?? null;
    if (sendNotification && !effectivePickupAddress) {
      return res.status(400).json({ error: "受け取り場所が未設定のため通知できません" });
    }

    await db.execute(sql`
      UPDATE van_contracts
      SET pickup_address = ${requestedAddress || null},
          pickup_datetime = ${pickupDate},
          start_date = ${effectiveDeliveryDate},
          updated_at = NOW()
      WHERE id = ${id}
    `);

    let notification: {
      user: "sent" | "no_recipient" | "failed" | "not_requested";
      rentalCompany: "sent" | "no_recipient" | "failed" | "not_requested";
    } = {
      user: "not_requested",
      rentalCompany: "not_requested",
    };

    if (sendNotification) {
      const dtStr = pickupDatetime
        ? pickupDate!.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '日時未定';
      const scheduleLabel = pickupDatetimeText
        ? dtStr
        : effectiveDeliveryDate || '未定';
      const userMessage = `納車・受け取り日時: ${scheduleLabel}\n受け取り場所: ${effectivePickupAddress}\n\n内容をご確認のうえ、ご不明な点はチャットよりお問い合わせください。`;
      const companyMessage = `利用者: ${contract.user_name || "未入力"}\n納車・受け取り日時: ${scheduleLabel}\n受け取り場所: ${effectivePickupAddress}\n\n受け取り準備をお願いいたします。`;
      const results = await Promise.allSettled([
        contract.user_id
          ? notifyUser(contract.user_id, "【Chat VAN】車両受け取り日時・場所のご案内", userMessage)
          : Promise.resolve(),
        contract.rental_company_id
          ? notifyRcUsers(contract.rental_company_id, "【Chat VAN】車両受け取り情報のご案内", companyMessage)
          : Promise.resolve(0),
      ]);

      notification = {
        user: !contract.user_id ? "no_recipient" : results[0].status === "fulfilled" ? "sent" : "failed",
        rentalCompany: !contract.rental_company_id
          ? "no_recipient"
          : results[1].status === "rejected"
            ? "failed"
            : results[1].value > 0
              ? "sent"
              : "no_recipient",
      };
      for (const result of results) {
        if (result.status === "rejected") {
          req.log.error({ err: result.reason, contractId: id }, "Pickup notification delivery failed");
        }
      }
    }

    return res.json({
      ok: true,
      pickupAddress: effectivePickupAddress || null,
      deliveryDate: effectiveDeliveryDate,
      notification,
    });
  } catch (err) {
    req.log.error({ err, contractId: req.params.id }, "Pickup update failed");
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
      await notifyUser(body.userId, 'Chat VAN - 契約書',
        "契約書が作成されました。内容をご確認ください。");
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
    if (!['draft', 'sent', 'pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    // Load the invoice first so that, on payment confirmation, we can advance the
    // linked contract through the single authoritative activation transition.
    const invRows = await db.execute(sql`
      SELECT id, contract_id, user_id FROM invoices WHERE id = ${id} LIMIT 1
    `);
    const invoice = ((invRows as any)?.rows ?? invRows ?? [])[0];
    if (!invoice) return res.status(404).json({ error: "請求書が見つかりません" });

    await db.execute(sql`
      UPDATE invoices
      SET status = ${status},
          paid_at = ${status === 'paid' ? sql`NOW()` : sql`NULL`}
      WHERE id = ${id}
    `);

    // 入金確認 → 契約を有効化（payment_processing の掛け払い契約のみ）。
    // これが請求書ライフサイクルにおける唯一の active 遷移。
    let activated = false;
    if (status === 'paid' && invoice.contract_id != null) {
      const result = await activateInvoiceContract(Number(invoice.contract_id));
      activated = result.activated;
      if (activated && invoice.user_id != null) {
        await notifyUser(Number(invoice.user_id), "Chat VAN - 入金確認完了",
          "ご入金を確認しました。車両のお引渡し手続きへ進みます。");
      }
    }
    return res.json({ ok: true, contractActivated: activated });
  } catch (err) {
    console.error("invoice status update error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /van/contracts/:id/activate-invoice  掛け払い契約の入金確認・有効化（管理者）
// 請求書払いで payment_processing にある契約を、唯一の権威ある遷移で
// active（application=delivery_pending / vehicle=rented）へ進める。
// クライアント入力に基づく直接有効化は許可しない（管理者のみ）。
router.post("/van/contracts/:id/activate-invoice", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid contract id" });

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, id));
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    if (contract.paymentMethod !== "invoice") {
      return res.status(400).json({ error: "この契約は請求書払いではありません" });
    }
    if (contract.status !== "payment_processing") {
      return res.status(400).json({ error: "決済処理中の請求書払い契約のみ有効化できます" });
    }

    const result = await activateInvoiceContract(id);
    if (!result.activated) {
      return res.status(409).json({ error: "契約はすでに処理済みです" });
    }

    await notifyUser(contract.userId, "Chat VAN - 入金確認完了",
      "ご入金を確認しました。車両のお引渡し手続きへ進みます。");

    return res.json({ ok: true, status: "active" });
  } catch (err) {
    console.error("activate invoice contract error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /van/contracts/:id/invoice  掛け払い請求書を手動発行（管理者）
router.post("/van/contracts/:id/invoice", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const contractId = parseInt(String(req.params.id));
    if (!Number.isInteger(contractId)) return res.status(400).json({ error: "Invalid contract id" });

    const contractRows = await db.execute(sql`
      SELECT id, user_id, status, payment_method, monthly_price, sin_japan_fee, start_date
      FROM van_contracts
      WHERE id = ${contractId}
      LIMIT 1
    `);
    const contract = ((contractRows as any)?.rows ?? contractRows)[0];
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    if (contract.payment_method !== "invoice") {
      return res.status(400).json({ error: "この契約は請求書払いではありません" });
    }
    // 掛け払いの初回請求書は入金確認（有効化）前に発行できる必要がある。
    // payment_processing（承認済み・入金待ち）または active（利用中）を許可する。
    if (contract.status !== "active" && contract.status !== "payment_processing") {
      return res.status(400).json({ error: "請求書は決済処理中または利用中の契約のみ発行できます" });
    }

    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth();
    const monthText = String(month + 1).padStart(2, "0");
    const monthDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const monthStart = `${year}-${monthText}-01`;
    const monthEnd = `${year}-${monthText}-${String(monthDays).padStart(2, "0")}`;
    const startDate = contract.start_date ? String(contract.start_date).slice(0, 10) : null;
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return res.status(400).json({ error: "契約開始日が不正なため請求書を発行できません" });
    }
    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const startDateUtc = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    if (
      startDateUtc.getUTCFullYear() !== startYear
      || startDateUtc.getUTCMonth() !== startMonth - 1
      || startDateUtc.getUTCDate() !== startDay
    ) {
      return res.status(400).json({ error: "契約開始日が不正なため請求書を発行できません" });
    }
    if (startDate > monthEnd) {
      return res.status(400).json({ error: "契約開始前の月の請求書は発行できません" });
    }
    // 管理画面からの手動発行は、当月分だけに固定する。
    // 初月は契約開始日から月末までを日割りで請求する。
    const periodStart = startDate > monthStart ? startDate : monthStart;
    const periodEnd = monthEnd;
    const dueDate = monthEnd;

    const invoiceNumber = `INV-${contractId}-${periodStart.slice(0, 7).replace("-", "")}`;
    const existingRows = await db.execute(sql`
      SELECT * FROM invoices
      WHERE contract_id = ${contractId} AND invoice_number = ${invoiceNumber}
      LIMIT 1
    `);
    const existing = ((existingRows as any)?.rows ?? existingRows)[0];
    if (existing) return res.json({ ok: true, alreadyIssued: true, invoice: existing });

    const preTaxMonthly = Number(contract.monthly_price) + Number(contract.sin_japan_fee ?? 0);
    const periodStartDate = new Date(`${periodStart}T00:00:00Z`);
    const days = Math.floor((new Date(`${periodEnd}T00:00:00Z`).getTime() - periodStartDate.getTime()) / 86400000) + 1;
    const subtotal = Math.round(
      periodStart === monthStart ? preTaxMonthly : (preTaxMonthly / monthDays) * days,
    );
    const tax = Math.round(subtotal * 0.1);
    const totalAmount = subtotal + tax;

    const periodLabel = `${periodStart}〜${periodEnd} 車両利用料`;
    const issuance = await db.transaction(async (tx) => {
      const createdRows = await tx.execute(sql`
        INSERT INTO invoices (
          user_id, contract_id, invoice_number, period_start, period_end,
          subtotal, tax, total_amount, status, due_date, created_at
        )
        VALUES (
          ${contract.user_id}, ${contractId}, ${invoiceNumber}, ${periodStart}, ${periodEnd},
          ${subtotal}, ${tax}, ${totalAmount}, 'pending', ${dueDate}, NOW()
        )
        ON CONFLICT (invoice_number) DO NOTHING
        RETURNING *
      `);
      const created = ((createdRows as any)?.rows ?? createdRows)[0];
      if (!created) {
        const concurrentRows = await tx.execute(sql`
          SELECT * FROM invoices
          WHERE contract_id = ${contractId} AND invoice_number = ${invoiceNumber}
          LIMIT 1
        `);
        return { created: null, existing: ((concurrentRows as any)?.rows ?? concurrentRows)[0] };
      }
      await tx.execute(sql`
        INSERT INTO invoice_items (invoice_id, description, amount)
        VALUES (${created.id}, ${periodLabel}, ${subtotal})
      `);
      return { created, existing: null };
    });
    if (!issuance.created) {
      return res.json({ ok: true, alreadyIssued: true, invoice: issuance.existing });
    }
    return res.status(201).json({ ok: true, alreadyIssued: false, invoice: issuance.created });
  } catch (err) {
    console.error("issue contract invoice error:", err);
    return res.status(500).json({ error: "請求書の発行に失敗しました" });
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
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid contract id" });

    // AUTHZ: only the contract owner or an admin may record consent/signature state.
    const caller = getCaller(req);
    const authz = await authorizeContractOwnerOrAdmin(caller, id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

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
      await notifyAdmins('Chat VAN - 契約同意完了',
        `契約書への同意が完了しました（契約ID: ${id}）。決済手続きをお願いします。`);
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
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid contract id" });

    // AUTHZ: only the contract owner or an admin may record consent/signature state.
    const caller = getCaller(req);
    const authz = await authorizeContractOwnerOrAdmin(caller, id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

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
    await notifyAdmins("Chat VAN - 契約署名完了",
      `契約書への電子署名が完了しました（契約ID: ${id}）。`);
    // 黒ナンバー代理取得の申請通知
    if (blackNumberRequested) {
      await notifyAdmins("🚗 黒ナンバー代理取得の依頼",
        `契約ID: ${id} のユーザーが黒ナンバー代理取得を希望しています。手続きを進めてください。`);
    }
    // 保険紹介の申請通知
    if (insuranceReferralRequested) {
      await notifyAdmins("🛡️ 保険紹介の依頼",
        `契約ID: ${id} のユーザーが保険紹介を希望しています。担当者から連絡してください。`);
    }
    await notifyUser(userId!, "Chat VAN - 署名受付完了",
      "電子署名を受け付けました。次はお支払い手続きへお進みください。");

    return res.json({ ok: true, contract: updated });
  } catch (err) {
    console.error("sign contract error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/contracts/:id/square-charge  Square決済 ─────────────────────
router.post("/van/contracts/:id/square-charge", requireAuth, async (req: Request, res: Response) => {
  try {
    const cfgErr = getSquareConfigError();
    if (cfgErr) return res.status(503).json({ error: cfgErr });

    const id = parseInt(String(req.params.id));
    const { sourceId } = req.body as { sourceId: string };
    if (!sourceId) return res.status(400).json({ error: "sourceId required" });

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, id));
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    if (contract.userId !== req.session.userId && req.session.userRole !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const contractStartDate = parseCalendarDate(contract.startDate);
    if (!contractStartDate) {
      return res.status(400).json({ error: "契約開始日を設定してからカード決済を行ってください" });
    }
    const initialPeriodMonth = contractStartDate.slice(0, 7);
    const existingInitial = await db.execute(sql`
      SELECT id, square_payment_id
      FROM payment_retries
      WHERE contract_id = ${id}
        AND period_month = ${initialPeriodMonth}
        AND failure_reason = '[初回決済]'
        AND result = 'success'
      LIMIT 1
    `);
    const existingInitialRow = ((existingInitial as any)?.rows ?? existingInitial ?? [])[0];
    if (existingInitialRow) {
      await db.execute(sql`UPDATE van_contracts SET status = 'active', payment_method = 'card', updated_at = NOW() WHERE id = ${id}`);
      return res.json({ ok: true, alreadyPaid: true, paymentId: existingInitialRow.square_payment_id });
    }
    const monthlyBase = Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0);
    // optionsFee は契約署名時に保存済み（raw SQL で読む）
    const optionsRow = await db.execute(sql`SELECT options_fee FROM van_contracts WHERE id = ${id}`);
    const optionsFee = Number((optionsRow as any)?.rows?.[0]?.options_fee ?? 0);
    const totalAmount = Math.round(monthlyBase * 1.1) + optionsFee;
    if (totalAmount <= 0) return res.status(400).json({ error: "金額が設定されていません" });
    const initialPaymentNote = `Chat VAN 初回決済 契約#${id}${optionsFee > 0 ? " +オプション" : ""}`;
    const paymentClaim = await db.execute(sql`
      UPDATE van_contracts
      SET status = 'payment_processing', updated_at = NOW()
      WHERE id = ${id} AND status = 'pending_payment'
      RETURNING id
    `);
    if (((paymentClaim as any)?.rows ?? paymentClaim ?? []).length === 0) {
      const currentStatus = await db.execute(sql`SELECT status FROM van_contracts WHERE id = ${id} LIMIT 1`);
      const status = ((currentStatus as any)?.rows ?? currentStatus ?? [])[0]?.status;
      if (status !== "payment_processing") {
        return res.status(409).json({ error: "この契約はすでに決済済み、または決済処理中です" });
      }
      try {
        const claimTime = new Date(contract.updatedAt ?? Date.now());
        let cursor: string | undefined;
        let recoveredPayment: any;
        for (let page = 0; page < 20 && !recoveredPayment; page += 1) {
          const params = new URLSearchParams({
            location_id: String(process.env.SQUARE_LOCATION_ID ?? ""),
            begin_time: claimTime.toISOString(),
            sort_order: "DESC",
            limit: "100",
          });
          if (cursor) params.set("cursor", cursor);
          const recoveryResponse = await squareFetch(`/v2/payments?${params.toString()}`, "GET");
          const recoveryData = await recoveryResponse.json() as any;
          if (!recoveryResponse.ok) throw new Error(JSON.stringify(recoveryData.errors ?? "Square照合エラー"));
          recoveredPayment = recoveryData.payments?.find((payment: any) =>
            payment.status === "COMPLETED"
            && payment.note === initialPaymentNote
            && Number(payment.amount_money?.amount) === totalAmount
            && payment.amount_money?.currency === "JPY"
          );
          cursor = recoveryData.cursor;
          if (!cursor) break;
        }
        const recoveredAt = new Date(recoveredPayment?.created_at ?? "");
        if (recoveredPayment?.id && !Number.isNaN(recoveredAt.getTime())) {
          await db.execute(sql`
            INSERT INTO payment_retries (
              contract_id, user_id, amount, period_month, result,
              square_payment_id, failure_reason, attempted_at
            )
            VALUES (
              ${id}, ${contract.userId}, ${Number(recoveredPayment.amount_money?.amount ?? 0)}, ${initialPeriodMonth}, 'success',
              ${recoveredPayment.id}, '[初回決済]', ${recoveredAt}
            )
            ON CONFLICT (contract_id, period_month)
              WHERE failure_reason = '[初回決済]'
            DO NOTHING
          `);
          await db.execute(sql`UPDATE van_contracts SET status = 'active', payment_method = 'card', updated_at = NOW() WHERE id = ${id}`);
          if (contract.applicationId) {
            await db.update(vanApplicationsTable).set({ status: "delivery_pending", updatedAt: new Date() })
              .where(eq(vanApplicationsTable.id, contract.applicationId));
          }
          await db.update(vehiclesTable).set({ status: "rented", updatedAt: new Date() })
            .where(eq(vehiclesTable.id, contract.vehicleId));
          return res.json({ ok: true, recovered: true, paymentId: recoveredPayment.id });
        }
      } catch (error) {
        console.error("初回決済のSquare照合に失敗しました", error);
      }
      return res.status(409).json({ error: "決済処理中です。二重請求を防ぐため、管理者へ確認を依頼してください。" });
    }

    const squareRes = await squareFetch("/v2/payments", "POST", {
      source_id: sourceId,
      idempotency_key: `initial-${contract.id}-${initialPeriodMonth}`,
      amount_money: { amount: totalAmount, currency: "JPY" },
      location_id: process.env.SQUARE_LOCATION_ID,
      autocomplete: true,
      note: initialPaymentNote,
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
      await db.execute(sql`
        UPDATE van_contracts
        SET status = 'pending_payment', updated_at = NOW()
        WHERE id = ${id} AND status = 'payment_processing'
      `);
      return res.status(502).json({ error: errMsg });
    }

    // 初回カード決済も売上台帳に残す（ダッシュボード・PLのカード売上集計元）
    const initialLedgerInsert = await db.execute(sql`
      INSERT INTO payment_retries (
        contract_id, user_id, amount, period_month, result,
        square_payment_id, failure_reason, attempted_at
      )
      VALUES (
        ${id}, ${contract.userId}, ${totalAmount}, ${initialPeriodMonth}, 'success',
        ${data.payment?.id ?? null}, '[初回決済]', NOW()
      )
      ON CONFLICT (contract_id, period_month)
        WHERE failure_reason = '[初回決済]'
      DO NOTHING
      RETURNING id
    `);
    const initialLedgerInserted = ((initialLedgerInsert as any)?.rows ?? initialLedgerInsert ?? []).length > 0;
    // 決済成功 → contract/application/vehicle をアクティブに
    await db.execute(sql`UPDATE van_contracts SET status = 'active', payment_method = 'card', updated_at = NOW() WHERE id = ${id}`);
    if (!initialLedgerInserted) {
      return res.json({ ok: true, alreadyPaid: true, paymentId: data.payment?.id ?? null });
    }
    if (contract.applicationId) {
      await db.update(vanApplicationsTable).set({ status: "delivery_pending", updatedAt: new Date() }).where(eq(vanApplicationsTable.id, contract.applicationId));
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

        // Card on file を作成（nonce は使用済みなので payment ID を source_id に使う）
        if (customerId && data.payment?.id) {
          const cardRes = await squareFetch("/v2/cards", "POST", {
            idempotency_key: randomUUID(),
            source_id: data.payment.id,
            card: { customer_id: customerId },
          });
          if (cardRes.ok) {
            const cardData = await cardRes.json() as any;
            cardId = cardData.card?.id ?? null;
          } else {
            const errData = await cardRes.json() as any;
            console.error("Card on file creation error:", JSON.stringify(errData));
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

    await notifyUser(contract.userId, "Chat VAN - 決済完了・ご利用開始",
      `カード決済が完了しました（¥${totalAmount.toLocaleString()}）。レンタル会社から受け取り案内が届きます。`);

    // 協力会社へ通知（受け取り準備）
    if (contract.vehicleId) {
      const vehRcRaw = await db.execute(sql`SELECT rental_company_id FROM vehicles WHERE id = ${contract.vehicleId} LIMIT 1`);
      const rcIdForPickup = ((vehRcRaw as any).rows ?? vehRcRaw)[0]?.rental_company_id;
      if (rcIdForPickup) {
        await notifyRcUsers(rcIdForPickup,
          "車両の受け取り準備をしてください",
          `契約番号 ${contract.contractNumber ?? `#${contract.id}`} の決済が完了しました。利用者が車両を受け取りに来ます。`);
      }
    }

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
        await notifyUser(pr.user_id, "Chat VAN - 月額料金のお支払いが完了しました",
          `${pr.period_month ?? ''}分の月額料金（¥${amount.toLocaleString()}）のお支払いが完了しました。`);
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
        await notifyUser(pr.user_id, "Chat VAN - お支払いを確認しました",
          `${pr.period_month ?? ''}分のお支払いを確認しました（¥${amount.toLocaleString()}）。`);
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
        await notifyUser(contract.userId, "Chat VAN - 追加決済が完了しました",
          `${description}（¥${chargeAmount.toLocaleString()}）の決済が完了しました。`);
      }
      return res.json({ ok: true, method: 'card' });

    } else {
      // 請求書作成
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const issuedDate = now.toISOString().slice(0, 10);
      const invoiceNumber = `INV-${contractId}-ADD-${now.getTime()}`;
      const subtotal = Math.round(amount);
      const tax = Math.floor(subtotal * 0.1);
      const totalAmount = subtotal + tax;
      const due = dueDate ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2,'0')}-${String(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2,'0')}`;
      await db.transaction(async (tx) => {
        const createdRows = await tx.execute(sql`
          INSERT INTO invoices (user_id, contract_id, invoice_number, period_start, period_end, subtotal, tax, total_amount, status, due_date, created_at)
          VALUES (${contract.userId}, ${contractId}, ${invoiceNumber}, ${issuedDate}, ${issuedDate}, ${subtotal}, ${tax}, ${totalAmount}, 'pending', ${due}, NOW())
          RETURNING id
        `);
        const created = ((createdRows as any)?.rows ?? createdRows)[0];
        if (!created?.id) throw new Error("追加請求書の作成に失敗しました");
        await tx.execute(sql`
          INSERT INTO invoice_items (invoice_id, description, amount)
          VALUES (${created.id}, ${description}, ${subtotal})
        `);
      });
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
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid contract id" });

    // AUTHZ: only the contract owner or an admin may initiate payment on it.
    const caller = getCaller(req);
    const authz = await authorizeContractOwnerOrAdmin(caller, id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
    const contract = authz.value;

    // Only a contract awaiting payment may be paid through this endpoint.
    if (contract.status !== "pending_payment") {
      return res.status(400).json({ error: "この契約は決済待ちの状態ではありません" });
    }

    // Derive the payment method server-side. The client may only *opt in* to
    // invoice billing; every other value is treated as card. Card activation is
    // NEVER granted here — it must go through the verified Square provider
    // success path (POST /van/contracts/:id/square-charge). This endpoint only
    // handles the admin-approved invoice (法人請求書) flow.
    if (!isInvoiceRequested((req.body as { method?: string })?.method)) {
      return res.status(400).json({
        error: "カード決済はカード決済画面（Square）から実行してください。",
      });
    }

    // invoice 払いは法人口座が承認済み（approved）のみ許可。
    // 与信状態は契約名義人（contract.userId）で検証する（呼び出し元IDは信用しない）。
    const [user] = await db.select({ creditStatus: usersTable.creditStatus })
      .from(usersTable).where(eq(usersTable.id, contract.userId)).limit(1);
    if (!user || user.creditStatus !== "approved") {
      return res.status(400).json({
        error: user?.creditStatus === "pending"
          ? "法人口座は現在審査中です。承認後にご利用いただけます。"
          : "法人口座の申請が必要です。先に法人情報を入力してください。"
      });
    }

    // 請求書払いは即時アクティブ化しない。管理者が請求書を発行し入金を確認
    // （PATCH /van/invoices/:id/status, POST /van/contracts/:id/invoice）した
    // 時点で active / vehicle=rented へ遷移する。ここでは支払方法を記録し、
    // 契約を payment_processing に進めて管理者の処理待ちキューへ入れるのみ。
    await db.execute(sql`
      UPDATE van_contracts
      SET payment_method = 'invoice', status = 'payment_processing', updated_at = NOW()
      WHERE id = ${id} AND status = 'pending_payment'
    `);

    // ユーザー通知
    await notifyUser(contract.userId, "Chat VAN - 法人請求書払い申請受付",
      "法人請求書払いの申請を受け付けました。担当者より請求書の発行・受け取り案内をご連絡します。");

    // 管理者通知
    await notifyAdmins("Chat VAN - 法人請求書払い申請",
      `法人請求書払いの申請を受け付けました（契約ID: ${id}）。請求書発行と入金確認をお願いします。`);

    return res.json({ ok: true, paymentMethod: "invoice", status: "payment_processing" });
  } catch (err) {
    console.error("pay error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/confirm-pickup  車両受け取り確認 ─────────────
router.post("/van/applications/:id/confirm-pickup", requireAuth, async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    if (!Number.isInteger(appId)) return res.status(400).json({ error: "Invalid application id" });
    const { pickupPhotos, pickupDocuments } = req.body as {
      pickupPhotos?: string[];
      pickupDocuments?: string[];
    };

    // AUTHZ: admin, the application owner, or the rental_company that owns the
    // contract vehicle. Uses the established rental_company role (not "company").
    const authz = await authorizeApplicationLifecycleActor(getCaller(req), appId);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
    const app = authz.value.app;
    // Use the EXACT authorized contract. Never re-query by application_id: for a
    // rental_company caller this guarantees mutations stay scoped to the
    // company-owned contract/vehicle rather than an arbitrary application row.
    const contract = authz.value.contract;
    if (app.status !== "delivery_pending") return res.status(400).json({ error: "受け取り確認は delivery_pending 状態のみ可能です" });

    await db.update(vanApplicationsTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId));

    // 車両ステータスを貸出中に・写真/書類を保存（認可済み契約のみ）
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

    if (app.userId != null) {
      await notifyUser(app.userId, "Chat VAN - 受け取り完了",
        "車両の受け取りが完了しました。ご利用開始です。毎月の自動決済が設定された支払日に実行されます。");
    }

    await notifyAdmins("Chat VAN - 受け取り完了",
      `申込ID: ${appId} の車両受け取りが完了しました。`);

    // 協力会社へ通知（自社車両の貸出開始）
    if (contract?.vehicleId) {
      const vehRaw = await db.execute(sql`SELECT rental_company_id FROM vehicles WHERE id = ${contract.vehicleId} LIMIT 1`);
      const rcId = ((vehRaw as any).rows ?? vehRaw)[0]?.rental_company_id;
      if (rcId) {
        await notifyRcUsers(rcId,
          "車両の貸出が開始されました",
          `契約番号 ${contract.contractNumber ?? `#${contract.id}`} の車両受け取りが完了し、貸出が開始されました。`);
      }
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
    if (!Number.isInteger(appId)) return res.status(400).json({ error: "Invalid application id" });
    const { reason } = req.body as { reason?: string };

    // AUTHZ: the application owner or an admin. A regular user is restricted to
    // their own application.
    const authz = await authorizeApplicationOwnerOrAdmin(getCaller(req), appId);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
    const app = authz.value;
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

    if (app.userId != null) {
      await db.insert(notificationsTable).values({
        userId: app.userId,
        title: "Chat VAN - 解約申請を受け付けました",
        message: "解約申請を受け付けました。担当者より返却手続きのご連絡をいたします（2〜3営業日以内）。",
      });
    }

    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "Chat VAN - 解約申請",
        message: `申込ID: ${appId} から解約申請が届きました。${reason ? `理由: ${reason}` : ""}`,
      });
    }

    // 協力会社へ通知（解約申請）
    const contractForRc = await db.execute(sql`
      SELECT vc.id, vc.contract_number, v.rental_company_id
      FROM van_contracts vc JOIN vehicles v ON v.id = vc.vehicle_id
      WHERE vc.application_id = ${appId} LIMIT 1
    `);
    const rcContractRow = ((contractForRc as any).rows ?? contractForRc)[0];
    if (rcContractRow?.rental_company_id) {
      await notifyRcUsers(rcContractRow.rental_company_id,
        "解約申請が届きました",
        `契約番号 ${rcContractRow.contract_number ?? `#${rcContractRow.id}`} の解約申請が届きました。返却手続きをご確認ください。`);
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

    // AUTHZ: admin, the application owner, or the rental_company that owns the
    // contract vehicle. Uses the established rental_company role (not "company").
    const authz = await authorizeApplicationLifecycleActor(getCaller(req), appId);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });
    const app = authz.value.app;
    // Use the EXACT authorized contract. Never re-query by application_id: for a
    // rental_company caller this guarantees mutations stay scoped to the
    // company-owned contract/vehicle rather than an arbitrary application row.
    const contract = authz.value.contract;
    if (app.status !== "return_pending") return res.status(400).json({ error: "返却確認は return_pending 状態のみ可能です" });

    await db.update(vanApplicationsTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId));

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

    if (app.userId != null) {
      await db.insert(notificationsTable).values({
        userId: app.userId,
        title: "Chat VAN - 返却完了",
        message: "車両の返却が完了しました。ご利用ありがとうございました。",
      });
    }

    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "Chat VAN - 返却完了",
        message: `申込ID: ${appId} の車両返却が完了しました。`,
      });
    }

    // 協力会社へ通知（返却完了）
    if (contract?.vehicleId) {
      const vehRaw3 = await db.execute(sql`SELECT rental_company_id FROM vehicles WHERE id = ${contract.vehicleId} LIMIT 1`);
      const rcId3 = ((vehRaw3 as any).rows ?? vehRaw3)[0]?.rental_company_id;
      if (rcId3) {
        await notifyRcUsers(rcId3,
          "車両が返却されました",
          `契約番号 ${contract.contractNumber ?? `#${contract.id}`} の車両が返却されました。`);
      }
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

    const [contracts, screening, identityVerification] = await Promise.all([
      // 契約（この相談に紐づく1件のみ）
      db.execute(sql`
        SELECT vc.*,
          v.maker, v.model, v.license_plate, v.prefecture, v.year, v.mileage,
          v.inspection_expiry, v.has_etc, v.has_dashcam, v.has_backup_cam,
          v.photos as vehicle_photos, v.vin, v.grade, v.smoking_policy,
          v.insurance_company, v.insurance_expiry, v.compulsory_insurance_expiry,
          v.mileage_limit, v.excess_mileage_fee,
          v.color, v.engine_displacement, v.fuel_type, v.transmission,
          v.black_number_status, v.max_period_months,
          v.shaken_cert_path, v.kensakusho_cert_path,
          v.jibaiseki_cert_path, v.ninni_hoken_cert_path,
          rc.id as rental_company_id, rc.name as rental_company_name,
          rc.phone as rental_company_phone, rc.address as rental_company_address
        FROM van_contracts vc
        LEFT JOIN vehicles v ON vc.vehicle_id = v.id
        LEFT JOIN rental_companies rc ON rc.id = COALESCE(v.rental_company_id, vc.rental_company_id)
        WHERE vc.application_id = ${appId}
        ORDER BY vc.created_at DESC
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

    // 事故・保険・GPS・決済は、この相談に紐づく契約だけを対象にする。
    const [incidents, insurance, gps, payments, invoices] = await Promise.all([
      contractIds.length ? db.execute(sql`
        WITH reports AS (
          -- 現在の事故・故障報告フォームは契約メッセージとして保存される。
          -- 会話ではなく、定型報告だけを事故・故障データとして取り出す。
          SELECT
            'report-message-' || cm.id AS report_key,
            cm.id,
            cm.contract_id,
            CASE
              WHEN cm.message LIKE '【交通事故】%' THEN 'accident'
              WHEN cm.message LIKE '【車両故障】%' THEN 'breakdown'
              WHEN cm.message LIKE '【盗難・不正使用】%' THEN 'theft'
              ELSE 'other'
            END AS incident_type,
            'reported'::text AS status,
            cm.message AS description,
            NULL::text AS location,
            NULL::boolean AS has_injuries,
            NULL::boolean AS police_contacted,
            NULL::boolean AS can_drive,
            cm.created_at
          FROM contract_messages cm
          WHERE cm.contract_id = ANY(ARRAY[${sql.raw(contractIds.join(','))}]::int[])
            AND (
              cm.message LIKE '【交通事故】%'
              OR cm.message LIKE '【車両故障】%'
              OR cm.message LIKE '【盗難・不正使用】%'
              OR cm.message LIKE '【その他トラブル】%'
            )

          UNION ALL

          -- 旧形式の事故記録も、契約に紐づく限り表示を継続する。
          SELECT
            'van-incident-' || vi.id AS report_key,
            vi.id,
            vi.contract_id,
            vi.incident_type::text AS incident_type,
            vi.status::text,
            vi.description,
            vi.location,
            vi.has_injuries,
            vi.police_contacted,
            vi.can_drive,
            vi.created_at
          FROM van_incidents vi
          WHERE vi.contract_id = ANY(ARRAY[${sql.raw(contractIds.join(','))}]::int[])

          UNION ALL

          -- AI一次受付経由の故障報告も表示する。
          SELECT
            'breakdown-' || b.id AS report_key,
            b.id,
            b.contract_id,
            'breakdown'::text AS incident_type,
            b.status::text,
            COALESCE(b.user_comment, b.symptom) AS description,
            b.location,
            NULL::boolean AS has_injuries,
            NULL::boolean AS police_contacted,
            b.can_drive,
            b.created_at
          FROM breakdowns b
          WHERE b.contract_id = ANY(ARRAY[${sql.raw(contractIds.join(','))}]::int[])
        )
        SELECT reports.*, vc.id as contract_number,
          v.maker, v.model, v.license_plate
        FROM reports
        LEFT JOIN van_contracts vc ON reports.contract_id = vc.id
        LEFT JOIN vehicles v ON vc.vehicle_id = v.id
        ORDER BY reports.created_at DESC
      `) : { rows: [] },
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
      contractIds.length ? db.execute(sql`
        SELECT * FROM invoices
        WHERE contract_id = ANY(ARRAY[${sql.raw(contractIds.join(','))}]::int[])
        ORDER BY created_at DESC
      `) : { rows: [] },
    ]);

    // 利用者のブラウザ位置情報は、この相談に紐づく契約だけを対象にする。
    // 同じ利用者の別契約の履歴を相談詳細へ混在させない。
    const userLocations = contractIds.length ? await db.execute(sql`
      SELECT id, latitude, longitude, accuracy, contract_id, recorded_at
      FROM user_locations
      WHERE user_id = ${userId}
        AND contract_id = ANY(ARRAY[${sql.raw(contractIds.join(','))}]::int[])
      ORDER BY recorded_at DESC
      LIMIT 50
    `) : { rows: [] };

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

    }
    // eKYC完了後にAI呼び出しが失敗・中断しても、画面の定期更新をきっかけに安全に再開する。
    if (result?.status === "verified" && app.status === "application_received") {
      scheduleAIScreening(appId);
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

    const emergencyContactFields = [
      b.emergency_contact_name,
      b.emergency_contact_phone,
      b.emergency_contact_relation,
    ];
    if (emergencyContactFields.some(value => typeof value !== "string" || !value.trim())) {
      return res.status(400).json({ error: "Emergency contact name, phone, and relation are required" });
    }

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
    await notifyAdmins('Chat VAN - 免許証提出',
      `免許証の確認依頼が届きました（相談ID: ${appId}）`);

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
    const { latitude, longitude, accuracy, contractId: rawContractId } = req.body as {
      latitude: number; longitude: number; accuracy?: number; contractId?: number | string;
    };
    if (latitude == null || longitude == null) return res.status(400).json({ error: "latitude/longitude required" });
    const numericLatitude = Number(latitude);
    const numericLongitude = Number(longitude);
    const numericAccuracy = accuracy == null ? null : Number(accuracy);
    if (
      !Number.isFinite(numericLatitude)
      || !Number.isFinite(numericLongitude)
      || numericLatitude < -90
      || numericLatitude > 90
      || numericLongitude < -180
      || numericLongitude > 180
      || (numericAccuracy != null && (!Number.isFinite(numericAccuracy) || numericAccuracy < 0))
    ) {
      return res.status(400).json({ error: "有効な位置情報を送信してください" });
    }
    const contractId = Number(rawContractId);
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return res.status(400).json({ error: "有効な契約IDが必要です" });
    }

    // 契約の所有者・利用中状態・GPS同意を、保存直前にまとめて確認する。
    const contractRows = await db.execute(sql`
      SELECT id
      FROM van_contracts
      WHERE id = ${contractId}
        AND user_id = ${userId}
        AND status = 'active'
        AND gps_consent = true
      LIMIT 1
    `);
    const contract = ((contractRows as any)?.rows ?? contractRows)[0];
    if (!contract) {
      return res.status(403).json({ error: "GPS位置情報を送信できる利用中の契約がありません" });
    }

    await db.execute(sql`
      INSERT INTO user_locations (user_id, contract_id, latitude, longitude, accuracy, recorded_at)
      VALUES (${userId}, ${contractId}, ${String(numericLatitude)}, ${String(numericLongitude)}, ${numericAccuracy}, NOW())
    `);
    return res.json({ ok: true });
  } catch (err) {
    console.error("location post error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 利用者アプリの位置送信対象 ──────────────────────────────────────────────
router.get("/van/location/active-contract", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: number | undefined = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await db.execute(sql`
      SELECT id
      FROM van_contracts
      WHERE user_id = ${userId}
        AND status = 'active'
        AND gps_consent = true
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    const contract = ((result as any)?.rows ?? result)[0];
    return res.json({ contractId: contract?.id ?? null });
  } catch (err) {
    console.error("active location contract error:", err);
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
    const vehicleId = b.vehicle_id ? parseInt(b.vehicle_id) : null;
    if (vehicleId == null || isNaN(vehicleId)) {
      return res.status(400).json({ error: "vehicle_id は必須です" });
    }
    const [result] = await db.insert(gpsDevicesTable).values({
      vehicleId,
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
      model: "gpt-5.4-mini",
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
        await notifyAdmins('⚠️ Chat VAN - 故障報告',
          `故障が報告されました。症状: ${info.symptom}`);
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
      await notifyUser(contract.userId, '⚠️ 決済エラー',
        `${periodMonth}分の月額料金の決済に失敗しました。お支払い方法をご確認ください。`);
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

    const inviteEmail = String(req.body.email || company.email || "").trim().toLowerCase();
    if (!inviteEmail) return res.status(400).json({ error: "メールアドレスを指定してください" });

    // 既存ユーザーに権限付与
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(sql`LOWER(BTRIM(${usersTable.email})) = ${inviteEmail}`).limit(1);
    if (existing) {
      await db.execute(sql`
        UPDATE users
        SET role = 'rental_company',
            rental_company_id = ${rcId},
            company_name = ${company.name},
            phone = COALESCE(NULLIF(phone, ''), ${company.phone})
        WHERE id = ${existing.id}
      `);
      return res.json({ message: "既存アカウントに協力会社権限を付与しました", userId: existing.id, email: inviteEmail });
    }

    // 新規ユーザー作成
    const bcrypt = await import("bcryptjs");
    const chars = "abcdefghijkmnpqrstuvwxyz23456789";
    const tempPassword = req.body.password ||
      Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const raw = await db.execute(sql`
      INSERT INTO users (email, password_hash, name, company_name, phone, role, rental_company_id)
      VALUES (${inviteEmail}, ${passwordHash}, ${req.body.name ?? company.contactName ?? company.name},
        ${company.name}, ${company.phone}, 'rental_company', ${rcId})
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
router.post("/van/vehicles/parse-shaken", requireAuth, async (req: Request, res: Response) => {
  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const tmpFiles: string[] = [];
  const cleanup = async () => { for (const f of tmpFiles) { try { await fs.unlink(f); } catch {} } };

  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

    const supported = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
    let finalBase64 = imageBase64;
    let finalMime = mimeType;

    if (!supported.has(mimeType)) {
      // PDF or HEIC → convert to JPEG
      const tmpIn = path.join(os.tmpdir(), `shaken-in-${Date.now()}`);
      const ext = mimeType === "application/pdf" ? ".pdf" : ".heic";
      const inFile = tmpIn + ext;
      await fs.writeFile(inFile, Buffer.from(imageBase64, "base64"));
      tmpFiles.push(inFile);

      const outJpeg = tmpIn + "-out.jpg";
      tmpFiles.push(outJpeg);

      if (mimeType === "application/pdf") {
        // pdftoppm: PDF の1ページ目を PPM に変換 → convert で JPEG へ
        const ppmPrefix = tmpIn + "-page";
        tmpFiles.push(ppmPrefix + "-1.ppm");
        await execFileAsync("pdftoppm", ["-r", "200", "-f", "1", "-l", "1", inFile, ppmPrefix]);
        await execFileAsync("convert", [ppmPrefix + "-1.ppm", outJpeg]);
      } else {
        // HEIC → JPEG
        await execFileAsync("convert", [inFile, outJpeg]);
      }

      const jpegBuf = await fs.readFile(outJpeg);
      finalBase64 = jpegBuf.toString("base64");
      finalMime = "image/jpeg";
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${finalMime};base64,${finalBase64}`, detail: "high" } },
          { type: "text", text: `あなたは日本の自動車検査証（車検証）のOCR専門家です。
画像から以下の情報を正確に読み取り、JSONのみを返してください。マークダウンや説明文は不要です。

【車検証のレイアウトガイド】
- 左上エリア：「登録番号」（ナンバープレートの番号）
- 上段中央：「車名」（メーカー名）、「型式」（車種コード）
- 中段：「車台番号」（VIN、アルファベット+数字）、「原動機の型式」
- 「初度登録年月」：和暦または西暦で記載（例: 令和6年 → 2024年）
- 「有効期間の満了する日」：車検満了日（例: 令和8年8月14日 → 2026-08-14）
- 「所有者」：車検証の所有者氏名・法人名（左下エリア）
- 「使用者」：使用者氏名・法人名（所有者の下または右）
- 「総排気量」：単位はL（例: 0.66L → "660cc"に変換）
- 「燃料の種類」：ガソリン、軽油、電気、LPG等
- 「車体の色」：白、黒、シルバー等

【抽出ルール】
- 和暦→西暦変換: 令和1年=2019年、令和2年=2020年（以降+1）、平成1年=1989年（以降+1）
- inspectionExpiry は YYYY-MM-DD 形式で返す
- year は4桁の西暦整数で返す
- licensePlate は「地域名 分類番号 ひらがな 一連番号」の完全な形式（例: "横浜 300 あ 1234"）
- engineDisplacement は "660cc" のようなcc表記に統一
- transmission が読み取れない場合はnull（「AT」「CVT」「MT」「AMT」のいずれか）
- 読み取れない・記載なしの項目はnullにする

{
  "licensePlate": null,
  "maker": null,
  "model": null,
  "grade": null,
  "vin": null,
  "year": null,
  "engineDisplacement": null,
  "fuelType": null,
  "transmission": null,
  "color": null,
  "inspectionExpiry": null,
  "inspectionCertificateOwner": null,
  "inspectionCertificateUser": null
}` }
        ]
      }],
      max_completion_tokens: 800,
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    await cleanup();
    if (!match) return res.status(422).json({ error: "OCR結果を解析できませんでした" });
    return res.json(JSON.parse(match[0]));
  } catch (err) {
    await cleanup();
    console.error("parse-shaken error:", err);
    return res.status(500).json({ error: "OCR処理に失敗しました" });
  }
});

// ── Rental Companies ───────────────────────────────────────────────────────
router.get("/van/rental-companies", requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
    const { contactPerson, serviceArea, ...body } = req.body ?? {};
    const normalizedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!body.name || !normalizedEmail) {
      return res.status(400).json({ error: "会社名・メールアドレスは必須です" });
    }
    const [company] = await db.insert(rentalCompaniesTable).values({
      ...body,
      email: normalizedEmail,
      ...(contactPerson !== undefined ? { contactName: contactPerson } : {}),
      ...(serviceArea !== undefined ? { serviceAreas: serviceArea } : {}),
    }).returning();
    return res.status(201).json(company);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/van/rental-companies/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
    const { contactPerson, serviceArea, ...body } = req.body ?? {};
    if (body.email !== undefined) {
      const normalizedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!normalizedEmail) return res.status(400).json({ error: "メールアドレスは必須です" });
      body.email = normalizedEmail;
    }
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(rentalCompaniesTable)
        .where(eq(rentalCompaniesTable.id, id)).limit(1);
      if (!current) return null;

      const [nextCompany] = await tx.update(rentalCompaniesTable).set({
        ...body,
        ...(contactPerson !== undefined ? { contactName: contactPerson } : {}),
        ...(serviceArea !== undefined ? { serviceAreas: serviceArea } : {}),
        updatedAt: new Date(),
      }).where(eq(rentalCompaniesTable.id, id)).returning();

      // 全ての紐づきアカウントには会社名を同期する。担当者情報は、
      // 会社メールと一致する代表ログインアカウントだけに同期して個別担当者を上書きしない。
      await tx.update(usersTable).set({ companyName: nextCompany.name })
        .where(and(eq(usersTable.rentalCompanyId, id), eq(usersTable.role, "rental_company")));

      const currentCompanyEmail = current.email?.trim().toLowerCase() || "";
      if (currentCompanyEmail) {
        const [primaryUser] = await tx.select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
        }).from(usersTable).where(and(
          eq(usersTable.rentalCompanyId, id),
          eq(usersTable.role, "rental_company"),
          sql`LOWER(BTRIM(${usersTable.email})) = ${currentCompanyEmail}`,
        )).limit(1);

        if (primaryUser) {
          if (nextCompany.email && nextCompany.email !== primaryUser.email) {
            const [emailOwner] = await tx.select({ id: usersTable.id }).from(usersTable)
              .where(sql`LOWER(BTRIM(${usersTable.email})) = ${nextCompany.email}`).limit(1);
            if (emailOwner && emailOwner.id !== primaryUser.id) {
              throw new RentalCompanyAccountEmailConflictError();
            }
          }
          await tx.update(usersTable).set({
            name: nextCompany.contactName || primaryUser.name,
            companyName: nextCompany.name,
            phone: nextCompany.phone || null,
            ...(nextCompany.email ? { email: nextCompany.email } : {}),
          }).where(eq(usersTable.id, primaryUser.id));
        }
      }
      return nextCompany;
    });
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    if (err instanceof RentalCompanyAccountEmailConflictError) {
      return res.status(409).json({ error: "このメールアドレスは別のアカウントで使用されています" });
    }
    req.log.error({ err }, "rental company update error");
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
db.execute(sql`CREATE INDEX IF NOT EXISTS user_locations_contract_id_idx ON user_locations(contract_id, recorded_at DESC)`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS inspection_doc TEXT`).catch(() => {});
db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compulsory_insurance_doc TEXT`).catch(() => {});
// 月額自動決済は契約・対象月ごとに一度だけ入金台帳へ残す。

// ── 月額自動決済スケジューラー (毎日 JST 9:00 = UTC 0:00) ────────────────
export function startMonthlyBillingScheduler() {
  cron.schedule("0 0 * * *", async () => {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today    = jstNow.getUTCDate();
  const jstYear  = jstNow.getUTCFullYear();
  const jstMonth = jstNow.getUTCMonth(); // 0-indexed
  console.log(`[月額決済] チェック開始 JST: ${jstYear}-${jstMonth + 1}-${today}`);

  // ── ① カード払い：支払日に自動課金 ──────────────────────────────────
  try {
    const cardRows = await db
      .select({ contract: vanContractsTable, user: usersTable })
      .from(vanContractsTable)
      .leftJoin(usersTable, eq(vanContractsTable.userId, usersTable.id))
      .where(
        and(
          eq(vanContractsTable.status, "active" as any),
          sql`${vanContractsTable.paymentMethod} = 'card'`,
          sql`${vanContractsTable.paymentDay} <= ${today}`
        )
      );

    console.log(`[月額決済] カード対象: ${cardRows.length}件`);

    for (const { contract, user } of cardRows) {
      const preTax = Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0);
      const amount = Math.floor(preTax * 1.1);
      const idempotencyKey = `monthly-${contract.id}-${jstYear}-${jstMonth}`;
      const periodMonth = `${jstYear}-${String(jstMonth + 1).padStart(2, "0")}`;
      const todayDate = `${periodMonth}-${String(today).padStart(2, "0")}`;

      try {
        const startDate = parseCalendarDate(contract.startDate);
        if (!startDate) {
          console.warn(`[月額決済] 契約開始日が未設定 contract=${contract.id}`);
          await notifyAdmins("Chat VAN - 契約開始日が未設定です",
            `契約ID: ${contract.id} はカード月額決済の対象外にしています。契約開始日を設定してください。`);
          continue;
        }
        if (startDate > todayDate) continue;

        // 初回決済・月額決済・既存の月額再試行が同じ対象月に成功していれば重ねて請求しない。
        const ledgerCheck = await db.execute(sql`
          SELECT id
          FROM payment_retries
          WHERE contract_id = ${contract.id}
            AND period_month = ${periodMonth}
            AND result = 'success'
            AND square_payment_id IS NOT NULL
            AND (
              failure_reason IN ('[初回決済]', '[月額自動決済]')
              OR failure_reason IS NULL
            )
          LIMIT 1
        `);
        if (((ledgerCheck as any)?.rows ?? ledgerCheck ?? []).length > 0) continue;

        if (user?.squareCardId && user?.squareCustomerId) {
          const squareRes = await squareFetch("/v2/payments", "POST", {
            source_id: user.squareCardId,
            amount_money: { amount, currency: "JPY" },
            customer_id: user.squareCustomerId,
            location_id: process.env.SQUARE_LOCATION_ID,
            idempotency_key: idempotencyKey,
          });
          const data = await squareRes.json() as any;

          if (!squareRes.ok) {
            console.error(`[月額決済] カード失敗 contract=${contract.id}:`, data.errors);
            if (contract.applicationId) {
              await db.update(vanApplicationsTable)
                .set({ status: "payment_issue", updatedAt: new Date() })
                .where(eq(vanApplicationsTable.id, contract.applicationId));
            }
            await notifyUser(contract.userId, "Chat VAN - 月額決済に失敗しました",
              `月額料金（¥${amount.toLocaleString()}）の決済に失敗しました。お支払い情報をご確認ください。`);
          } else {
            const squarePaymentId = data.payment?.id;
            if (!squarePaymentId) {
              console.error(`[月額決済] 決済IDが取得できません contract=${contract.id}`);
              continue;
            }
            const ledgerInsert = await db.execute(sql`
              INSERT INTO payment_retries (
                contract_id, user_id, amount, period_month, attempt_number, result,
                square_payment_id, failure_reason, attempted_at
              )
              VALUES (
                ${contract.id}, ${contract.userId}, ${amount}, ${periodMonth}, 1, 'success',
                ${squarePaymentId}, '[月額自動決済]', NOW()
              )
              ON CONFLICT (contract_id, period_month)
                WHERE failure_reason = '[月額自動決済]'
              DO NOTHING
              RETURNING id
            `);
            if (((ledgerInsert as any)?.rows ?? ledgerInsert ?? []).length === 0) continue;
            console.log(`[月額決済] カード成功 contract=${contract.id} ¥${amount}`);
            await notifyUser(contract.userId, "Chat VAN - 月額料金のお支払いが完了しました",
              `月額料金（¥${amount.toLocaleString()}）のお支払いが完了しました。`);
          }
        } else {
          // カード情報未登録 → 管理者通知
          console.warn(`[月額決済] カード情報なし contract=${contract.id}`);
          await notifyAdmins("Chat VAN - カード情報未登録の契約があります",
            `契約ID: ${contract.id} のユーザーがカード情報を登録していません。確認してください。`);
        }
      } catch (e) {
        console.error(`[月額決済] カードエラー contract=${contract.id}:`, e);
      }
    }
  } catch (e) {
    console.error("[月額決済] カードスケジューラーエラー:", e);
  }

  // ── ② 請求書払い：前月分を日次で補完発行（同じ請求書番号は作成しない） ──

  try {
    // 前月の情報
    const prevMonth     = jstMonth === 0 ? 11 : jstMonth - 1;  // 0-indexed
    const prevYear      = jstMonth === 0 ? jstYear - 1 : jstYear;
    const prevMonthDays = new Date(prevYear, prevMonth + 1, 0).getDate();
    const periodStart   = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const periodEnd     = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevMonthDays).padStart(2, '0')}`;
    // 支払期限 = 当月末（翌月末払い）
    const curMonthDays  = new Date(jstYear, jstMonth + 1, 0).getDate();
    const dueDate       = `${jstYear}-${String(jstMonth + 1).padStart(2, '0')}-${String(curMonthDays).padStart(2, '0')}`;

    const invoiceRows = await db
      .select({ contract: vanContractsTable })
      .from(vanContractsTable)
      .where(
        and(
          eq(vanContractsTable.status, "active" as any),
          sql`${vanContractsTable.paymentMethod} = 'invoice'`
        )
      );

    console.log(`[月次請求書] 対象: ${invoiceRows.length}件 前月: ${prevYear}-${prevMonth + 1}`);

    for (const { contract } of invoiceRows) {
      try {
        const preTaxMonthly = Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0);
        const startDate = contract.startDate ? new Date(contract.startDate) : null;

        // 初月日割り判定: 利用開始日が前月にある場合
        let subtotal: number;
        let billingNote = "";
        if (
          startDate &&
          startDate.getFullYear() === prevYear &&
          startDate.getMonth() === prevMonth
        ) {
          // 初月：日割り計算（開始日〜月末）
          const daysInService = prevMonthDays - startDate.getDate() + 1;
          subtotal = Math.round((preTaxMonthly / prevMonthDays) * daysInService);
          billingNote = `（日割り: ${startDate.getDate()}日〜${prevMonthDays}日 / ${daysInService}日分）`;
        } else if (startDate && startDate > new Date(periodEnd)) {
          // まだ開始していない契約はスキップ
          continue;
        } else {
          // 通常月：満額
          subtotal = preTaxMonthly;
        }

        const tax         = Math.round(subtotal * 0.1);
        const totalAmount = subtotal + tax;
        const invoiceNumber = `INV-${contract.id}-${prevYear}${String(prevMonth + 1).padStart(2, '0')}`;

        const created = await db.transaction(async (tx) => {
          const createdRows = await tx.execute(sql`
            INSERT INTO invoices (user_id, contract_id, invoice_number, period_start, period_end, subtotal, tax, total_amount, status, due_date, created_at)
            VALUES (${contract.userId}, ${contract.id}, ${invoiceNumber}, ${periodStart}, ${periodEnd}, ${subtotal}, ${tax}, ${totalAmount}, 'pending', ${dueDate}, NOW())
            ON CONFLICT DO NOTHING
            RETURNING id
          `);
          const invoice = ((createdRows as any)?.rows ?? createdRows)[0];
          if (!invoice?.id) return null;
          const periodLabel = `${periodStart}〜${periodEnd} 車両利用料${billingNote}`;
          await tx.execute(sql`
            INSERT INTO invoice_items (invoice_id, description, amount)
            VALUES (${invoice.id}, ${periodLabel}, ${subtotal})
          `);
          return invoice;
        });
        if (!created) continue;

        await notifyAdmins("Chat VAN - 月次請求書を発行してください",
          `契約ID: ${contract.id} / ${invoiceNumber}${billingNote}\n税抜: ¥${subtotal.toLocaleString()} 消費税: ¥${tax.toLocaleString()} 合計: ¥${totalAmount.toLocaleString()}\n支払期限: ${dueDate}`);
        console.log(`[月次請求書] 発行 contract=${contract.id} ${invoiceNumber} ¥${totalAmount} 期限:${dueDate}${billingNote}`);
      } catch (e) {
        console.error(`[月次請求書] エラー contract=${contract.id}:`, e);
      }
    }
  } catch (e) {
    console.error("[月次請求書] スケジューラーエラー:", e);
  }
  }, { timezone: "UTC" });
}

export default router;
