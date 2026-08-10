/**
 * Chat VAN — van rental routes
 */
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたは日本の運転免許証と顔写真を審査するeKYCシステムです。
提出データ・免許証画像・セルフィーを総合的に照合し、以下のJSONのみ返してください:
{"result": "verified" | "rejected", "reason": "理由（日本語、30文字以内）"}`
        },
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
async function runAIScreening(appId: number) {
  try {
    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app || app.status !== "application_received") return;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたは軽バンレンタルサービスの審査AIです。
申込データを分析し、以下のJSONのみ返してください:
{"result": "approved" | "rejected", "reason": "理由（日本語、50文字以内）"}`
        },
        {
          role: "user",
          content: `【申込データ】
エリア: ${app.area ?? "未記入"}
月額予算: ${app.monthlyBudget ? `¥${Number(app.monthlyBudget).toLocaleString()}` : "未記入"}
利用目的: ${app.purpose ?? "未記入"}
利用期間: ${app.durationMonths ?? "未記入"}ヶ月
保険状況: ${app.insuranceStatus ?? "未記入"}
黒ナンバー: ${app.hasBlackNumber ? "取得済み" : "未取得"}
配送経験: ${app.hasDeliveryExperience ? "あり" : "なし"}

審査基準:
- 月額予算が30,000円以上
- 利用目的が法令に反しない（違法薬物輸送等でない）
- 保険未加入でも利用目的が個人・軽貨物なら許可
- 軽貨物業目的で黒ナンバー未取得でも仮承認可
- 明らかに虚偽・悪意のある申込は否決`
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

    // ユーザーに通知
    await db.insert(notificationsTable).values({
      userId: app.userId!,
      title: result === "approved" ? "Chat VAN - 審査通過" : "Chat VAN - 審査結果",
      message: result === "approved"
        ? "審査が通過しました！担当者が契約書を準備します。"
        : `審査の結果、今回はお断りとさせていただきました。${reason}`,
    });
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
運営会社はSIN JAPAN株式会社です。

## ヒアリング項目（優先順）
以下の情報を自然な会話で収集してください。
※ ユーザーの氏名・メールアドレス・電話番号はシステムで既に把握しているため、絶対に聞かないでください。

【基本情報（まず確認）】
1. 利用する都道府県・エリア
2. 利用開始希望日
3. 希望月額料金（最安30,000円〜。選択肢は「30,000円」「40,000円」「50,000円」「50,000円以上」で提示）

【詳細情報（基本が揃ったら確認）】
4. 利用目的（Amazon配送/Uber Eats/軽貨物業/個人使用 など）
5. 希望利用期間（3ヶ月・6ヶ月・1年の3択で提示）
6. 保険加入状況
7. 黒ナンバーの取得状況
8. 配送経験の有無

## 会話ルール
- 1ターンに質問は1〜2項目まで
- ユーザーが最初のメッセージで複数情報を伝えた場合は、重複して聞かない
- 親切で自然な日本語で応答する
- 丁寧すぎず、テンポよく会話を進める
- 氏名・メール・電話番号は絶対に聞かない（システムで管理済み）

## 選択肢ボタン（全ての質問に必須）
質問するときは必ず選択肢を出力する:
<options>["選択肢A", "選択肢B", "選択肢C"]</options>

## 完了タグ（必須）
エリア・開始日・月額・目的・期間・保険・黒ナンバー・配送経験が揃ったら、返答の末尾に必ず以下を出力する:

<van_inquiry>
{
  "area": "都道府県名",
  "startDate": "YYYY-MM-DD または 来月 など",
  "monthlyBudget": 30000,
  "purpose": "利用目的",
  "durationMonths": 6,
  "insuranceStatus": "加入済み/未加入/わからない",
  "hasBlackNumber": true,
  "hasDeliveryExperience": true
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
        startDate: inquiry.startDate as string,
        monthlyBudget: inquiry.monthlyBudget as number,
        purpose: inquiry.purpose as string,
        durationMonths: inquiry.durationMonths as number,
        insuranceStatus: inquiry.insuranceStatus as string,
        hasBlackNumber: inquiry.hasBlackNumber as boolean,
        hasDeliveryExperience: inquiry.hasDeliveryExperience as boolean,
        // ユーザー登録情報を優先、inquiryにあれば上書き
        applicantName: (inquiry.applicantName as string) ?? userInfo?.name ?? null,
        phone: (inquiry.phone as string) ?? userInfo?.phone ?? null,
        email: (inquiry.email as string) ?? userInfo?.email ?? null,
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

    if (inquiry && app.status === "new") {
      const budget   = (inquiry.monthlyBudget as number) ?? app.monthlyBudget ?? 0;
      const area     = (inquiry.area as string) ?? app.area ?? "";
      const duration = (inquiry.durationMonths as number) ?? app.durationMonths ?? 0;

      // ── 申込情報を更新 ─────────────────────────────────────────────────────
      await db.update(vanApplicationsTable).set({
        status: "hearing",
        area,
        startDate: (inquiry.startDate as string) ?? app.startDate,
        monthlyBudget: budget,
        purpose: (inquiry.purpose as string) ?? app.purpose,
        durationMonths: duration,
        insuranceStatus: (inquiry.insuranceStatus as string) ?? app.insuranceStatus,
        hasBlackNumber: (inquiry.hasBlackNumber as boolean) ?? app.hasBlackNumber,
        hasDeliveryExperience: (inquiry.hasDeliveryExperience as boolean) ?? app.hasDeliveryExperience,
        // ユーザー登録情報を優先（inquiryには氏名・連絡先は含まれなくなった）
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
      const scored: ScoredVehicle[] = allVehicles.map(row => {
        const totalPrice = Number(row.vehicle.monthlyPrice)
          + Number(row.vehicle.sinJapanFee ?? 0)
          + Number(row.vehicle.insuranceFee ?? 0);
        let score = 0;

        // エリア一致（都道府県名が含まれていればOK）
        const vPref = row.vehicle.prefecture ?? "";
        if (area && vPref && (area.includes(vPref) || vPref.includes(area))) score += 30;

        // 予算内（10%超過まで許容）
        if (budget > 0 && totalPrice <= budget * 1.10) score += 25;
        else if (budget > 0) score -= 20; // 予算オーバーはマイナス

        // 最低利用期間をユーザーが満たしているか
        const minPeriod = row.vehicle.minPeriodMonths ?? 1;
        if (duration > 0 && duration >= minPeriod) score += 20;
        else if (duration > 0) score -= 10;

        // 価格が予算に近いほど高スコア（コスパ優先）
        if (budget > 0 && totalPrice <= budget) {
          score += Math.round((1 - totalPrice / budget) * 10); // 予算より安いほど+
        }

        return { ...row, score };
      })
        .filter(r => r.score > 0)                        // スコアがプラスのもののみ
        .sort((a, b) => b.score - a.score)               // スコア降順
        .slice(0, 3);                                    // 最大3台

      if (scored.length > 0) {
        // ── マッチする車両あり → 自動提案 ──────────────────────────────────
        const vehicleIds = scored.map(r => r.vehicle.id);
        await db.insert(vanProposalsTable).values({
          applicationId: appId,
          vehicleIds: JSON.stringify(vehicleIds),
          message: "AI自動マッチングによる提案",
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
        const proposalMsg = `条件に合う車両が見つかりました！以下の車両をご提案します。\n\n${vehicleText}\n\n「提案された車両を確認する」ボタンから詳細をご覧ください。`;
        await db.insert(vanMessagesTable).values({
          vanApplicationId: appId,
          role: "assistant",
          content: proposalMsg,
        });
      } else {
        // ── マッチする車両なし → 管理者に手動提案を依頼 ───────────────────
        const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
        for (const admin of admins) {
          await db.insert(notificationsTable).values({
            userId: admin.id,
            message: `軽バン相談が完了しました（ID: ${appId} / ${inquiry.applicantName}様）自動マッチングなし。手動提案をお願いします。`,
            title: 'Chat VAN相談（要手動提案）',
          });
        }
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

    // Get identity verification
    const [idVerification] = await db.select().from(identityVerificationsTable)
      .where(eq(identityVerificationsTable.applicationId, id)).limit(1).catch(() => [null]);

    // Get contract
    const [contract] = await db.select().from(vanContractsTable)
      .where(eq(vanContractsTable.applicationId, id)).limit(1).catch(() => [null]);

    return res.json({ ...app, proposedVehicles, identityVerification: idVerification ?? null, contract: contract ?? null });
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
    // AI自動審査をバックグラウンドで実行（レスポンスをブロックしない）
    setImmediate(() => runAIScreening(appId));

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
      [totalVehicles], [availableVehicles],
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
    ]);

    const [revenueRow] = await db.select({ total: sql<number>`coalesce(sum(monthly_price), 0)` })
      .from(vanContractsTable).where(eq(vanContractsTable.status, "active" as any));

    // Payment issues count
    let paymentIssues = 0;
    try {
      const [piRow] = await db.select({ count: sql<number>`count(*)` }).from(paymentRetriesTable)
        .where(and(eq(paymentRetriesTable.result, 'failed'), sql`attempted_at > NOW() - INTERVAL '7 days'`));
      paymentIssues = Number(piRow?.count ?? 0);
    } catch { /* table may not exist yet */ }

    // Insurance expiring soon
    let insuranceAlerts = 0;
    try {
      const [insRow] = await db.select({ count: sql<number>`count(*)` }).from(insurancePoliciesTable)
        .where(and(eq(insurancePoliciesTable.status, 'active' as any), sql`expiry_date <= to_char(NOW() + INTERVAL '30 days', 'YYYY-MM-DD')`));
      insuranceAlerts = Number(insRow?.count ?? 0);
    } catch { /* table may not exist yet */ }

    return res.json({
      newConsultations: Number(newConsultations.count),
      pendingReview: Number(pendingReview.count),
      proposalSent: Number(proposalSent.count),
      activeApplications: Number(activeApplications.count),
      activeContracts: Number(activeContracts.count),
      returningSoon: Number(returningSoon.count),
      totalRevenue: Number(revenueRow?.total ?? 0),
      thisMonthRevenue: Number(revenueRow?.total ?? 0),
      totalVehicles: Number(totalVehicles.count),
      availableVehicles: Number(availableVehicles.count),
      paymentIssues,
      insuranceAlerts,
    });
  } catch (err) {
    console.error("dashboard error:", err);
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
    return res.json(rows.map(({ contract, vehicle, company }) => ({ ...contract, vehicle: vehicle ? { ...vehicle, rentalCompany: company } : null })));
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

// ── POST /van/contracts/:id/square-charge  Square決済 ─────────────────────
router.post("/van/contracts/:id/square-charge", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { sourceId } = req.body as { sourceId: string };
    if (!sourceId) return res.status(400).json({ error: "sourceId required" });

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, id));
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    const monthlyBase = Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0);
    const totalAmount = Math.round(monthlyBase * 1.1);
    if (totalAmount <= 0) return res.status(400).json({ error: "金額が設定されていません" });

    const squareRes = await squareFetch("/v2/payments", "POST", {
      source_id: sourceId,
      idempotency_key: randomUUID(),
      amount_money: { amount: totalAmount, currency: "JPY" },
      location_id: process.env.SQUARE_LOCATION_ID,
      autocomplete: true,
      note: `Chat VAN 月額 契約#${id}`,
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
    await db.update(vanContractsTable).set({ status: "active" as any, updatedAt: new Date() }).where(eq(vanContractsTable.id, id));
    if (contract.applicationId) {
      await db.update(vanApplicationsTable).set({ status: "active", updatedAt: new Date() }).where(eq(vanApplicationsTable.id, contract.applicationId));
    }
    await db.update(vehiclesTable).set({ status: "rented", updatedAt: new Date() }).where(eq(vehiclesTable.id, contract.vehicleId));

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

// ── POST /van/contracts/:id/pay  ユーザーが決済を確定 ──────────────────────
router.post("/van/contracts/:id/pay", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { method } = req.body as { method?: string };

    const [contract] = await db.select().from(vanContractsTable).where(eq(vanContractsTable.id, id));
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    // 契約・申込をアクティブに
    await db.update(vanContractsTable)
      .set({ status: "active" as any, updatedAt: new Date() })
      .where(eq(vanContractsTable.id, id));

    if (contract.applicationId) {
      await db.update(vanApplicationsTable)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(vanApplicationsTable.id, contract.applicationId));
    }

    // 車両ステータスを「貸出中」に
    await db.update(vehiclesTable)
      .set({ status: "rented", updatedAt: new Date() })
      .where(eq(vehiclesTable.id, contract.vehicleId));

    // ユーザー通知
    await db.insert(notificationsTable).values({
      userId: contract.userId,
      title: "Chat VAN - ご利用開始",
      message: method === 'transfer'
        ? "振込のご確認が完了しました。ご利用を開始できます。担当者よりご連絡いたします。"
        : "お支払いが完了しました。ご利用を開始できます。担当者よりご連絡いたします。",
    });

    // 管理者通知
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "Chat VAN - 決済完了",
        message: `決済が完了しました（契約ID: ${id} / 支払方法: ${method === 'transfer' ? '銀行振込' : 'カード'}）`,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("pay error:", err);
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
      // 契約
      db.execute(sql`
        SELECT vc.*, v.maker, v.model, v.license_plate, v.prefecture,
          rc.name as rental_company_name
        FROM van_contracts vc
        LEFT JOIN vehicles v ON vc.vehicle_id = v.id
        LEFT JOIN rental_companies rc ON v.rental_company_id = rc.id
        WHERE vc.user_id = ${userId}
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
      // 本人確認
      db.execute(sql`
        SELECT iv.* FROM identity_verifications iv WHERE iv.application_id = ${appId} ORDER BY iv.created_at DESC LIMIT 1
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
        WHERE pr.user_id = ${userId}
        ORDER BY pr.attempted_at DESC
      `) : { rows: [] },
    ]);

    const toR = (r: any) => r?.rows ?? (Array.isArray(r) ? r : []);

    return res.json({
      contracts: toR(contracts),
      insurance: toR(insurance),
      gps: toR(gps),
      incidents: toR(incidents),
      screening: toR(screening),
      identityVerification: toR(identityVerification)[0] ?? null,
      payments: toR(payments),
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

    const [result] = await db.select().from(identityVerificationsTable)
      .where(eq(identityVerificationsTable.applicationId, appId)).limit(1);
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
        status: 'submitted' as any, rejectionReason: null, updatedAt: new Date(),
      }).where(eq(identityVerificationsTable.id, existing[0].id)).returning();
      // selfie_photo は別カラムとして保存（マイグレーション済みの場合）
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
    const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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
    const [updated] = await db.update(vehiclesTable).set(req.body).where(eq(vehiclesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
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

// ── マイグレーション: selfie_photo 列追加 ─────────────────────────────────
db.execute(sql`
  ALTER TABLE identity_verifications
  ADD COLUMN IF NOT EXISTS selfie_photo TEXT
`).catch(() => {});

export default router;
