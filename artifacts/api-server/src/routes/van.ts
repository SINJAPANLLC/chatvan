/**
 * Chat VAN — van rental routes
 * Handles: /van/start, /van/applications, /van/vehicles, /van/rental-companies,
 *           /van/contracts, /van/dashboard
 */
import { Router, type IRouter } from "express";
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
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// ── System prompt ──────────────────────────────────────────────────────────

const VAN_SYSTEM_PROMPT = `あなたは「Chat VAN」のAIアシスタントです。
軽バンのレンタル相談を受け付け、ユーザーの条件をヒアリングするのがあなたの役割です。

## サービス概要
Chat VANは、チャットで希望条件を伝えると最適な軽バンを提案するサービスです。
運営会社はSIN JAPAN株式会社です。

## ヒアリング項目（優先順）
以下の情報を自然な会話で収集してください。

【基本情報（まず確認）】
1. 利用する都道府県・エリア
2. 利用開始希望日
3. 希望月額料金

【詳細情報（基本が揃ったら確認）】
4. 利用目的（Amazon配送/Uber Eats/軽貨物業/個人使用 など）
5. 希望利用期間（月数）
6. 保険加入状況
7. 黒ナンバーの取得状況
8. 配送経験の有無

【申込み情報（最後に確認）】
9. 氏名
10. 電話番号
11. メールアドレス

## 会話ルール
- 1ターンに質問は1〜2項目まで
- ユーザーが最初のメッセージで複数情報を伝えた場合は、重複して聞かない
- 親切で自然な日本語で応答する
- 丁寧すぎず、テンポよく会話を進める
- 条件を3つ（エリア・開始日・予算）確認したら「条件に合う車両を確認します。引き続きお聞きします。」と伝える

## 選択肢ボタン（全ての質問に必須）
質問するときは必ず選択肢を出力する:
<options>["選択肢A", "選択肢B", "選択肢C"]</options>

利用目的の例: <options>["Amazon配送","Uber Eats","軽貨物業（個人事業）","引越し・荷物運搬","その他"]</options>
期間の例: <options>["3ヶ月","6ヶ月","12ヶ月","それ以上","未定"]</options>
保険の例: <options>["加入済み","未加入（これから加入）","わからない"]</options>
黒ナンバーの例: <options>["取得済み","未取得","わからない"]</options>
配送経験の例: <options>["あり","なし（初めて）"]</options>

## 完了タグ（必須）
氏名・電話番号・メールアドレスまで揃ったら、返答の末尾に必ず以下を出力する:

<van_inquiry>
{
  "area": "都道府県名",
  "startDate": "YYYY-MM-DD または 来月 など",
  "monthlyBudget": 30000,
  "purpose": "利用目的",
  "durationMonths": 6,
  "insuranceStatus": "加入済み/未加入/わからない",
  "hasBlackNumber": true,
  "hasDeliveryExperience": true,
  "applicantName": "山田太郎",
  "phone": "090-1234-5678",
  "email": "yamada@example.com"
}
</van_inquiry>`;

// ── Helper: parse options tag ──────────────────────────────────────────────
function parseOptions(text: string): string[] | null {
  const match = text.match(/<options>([\s\S]*?)<\/options>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

// ── Helper: parse van_inquiry tag ─────────────────────────────────────────
function parseVanInquiry(text: string): Record<string, unknown> | null {
  const match = text.match(/<van_inquiry>([\s\S]*?)<\/van_inquiry>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

// ── Helper: clean AI text (remove tags) ───────────────────────────────────
function cleanText(text: string): string {
  return text
    .replace(/<options>[\s\S]*?<\/options>/g, "")
    .replace(/<van_inquiry>[\s\S]*?<\/van_inquiry>/g, "")
    .trim();
}

// ── POST /van/start ────────────────────────────────────────────────────────
router.post("/van/start", async (req, res) => {
  try {
    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      return res.status(400).json({ error: "message required" });
    }
    const userId: number | undefined = (req.session as any)?.userId;

    // Create application
    const [app] = await db.insert(vanApplicationsTable).values({
      userId: userId ?? null,
      status: "相談中",
      requestText: message,
    }).returning();

    // Save user message
    const [userMsg] = await db.insert(vanMessagesTable).values({
      vanApplicationId: app.id,
      role: "user",
      content: message,
    }).returning();

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: VAN_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
    });

    const aiText = completion.choices[0]?.message?.content ?? "ご連絡ありがとうございます。詳しくお聞かせください。";
    const options = parseOptions(aiText);
    const inquiry = parseVanInquiry(aiText);
    const cleanedText = cleanText(aiText);

    // Save AI message
    await db.insert(vanMessagesTable).values({
      vanApplicationId: app.id,
      role: "assistant",
      content: aiText,
    });

    // If complete inquiry, update application
    if (inquiry) {
      await db.update(vanApplicationsTable).set({
        status: "確認中",
        area: inquiry.area as string,
        startDate: inquiry.startDate as string,
        monthlyBudget: inquiry.monthlyBudget as number,
        purpose: inquiry.purpose as string,
        durationMonths: inquiry.durationMonths as number,
        insuranceStatus: inquiry.insuranceStatus as string,
        hasBlackNumber: inquiry.hasBlackNumber as boolean,
        hasDeliveryExperience: inquiry.hasDeliveryExperience as boolean,
        applicantName: inquiry.applicantName as string,
        phone: inquiry.phone as string,
        email: inquiry.email as string,
        updatedAt: new Date(),
      }).where(eq(vanApplicationsTable.id, app.id));

      // Notify admin
      const admins = await db.select({ id: usersTable.id })
        .from(usersTable).where(eq(usersTable.role, "admin"));
      for (const admin of admins) {
        await db.insert(notificationsTable).values({
          userId: admin.id,
          message: `新しい軽バン相談が届きました（ID: ${app.id} / ${inquiry.area} / ¥${inquiry.monthlyBudget?.toLocaleString()}/月）`,
          title: 'Chat VAN相談',
        });
      }
    }

    return res.status(201).json({
      applicationId: app.id,
      conversationId: app.id, // same ID for simplicity
      aiMessage: cleanedText,
      options,
      isComplete: !!inquiry,
    });
  } catch (err) {
    console.error("van/start error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/applications/:id/messages ────────────────────────────────────
router.get("/van/applications/:id/messages", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const msgs = await db.select().from(vanMessagesTable)
      .where(eq(vanMessagesTable.vanApplicationId, id))
      .orderBy(vanMessagesTable.createdAt);

    const result = msgs.map((m) => {
      const options = parseOptions(m.content);
      return {
        id: m.id,
        role: m.role,
        content: cleanText(m.content),
        options,
        createdAt: m.createdAt,
      };
    });
    return res.json(result);
  } catch (err) {
    console.error("list messages error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/messages ───────────────────────────────────
router.post("/van/applications/:id/messages", async (req, res) => {
  try {
    const appId = parseInt(String(req.params.id));
    const { message } = req.body as { message: string };
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app) return res.status(404).json({ error: "Application not found" });

    // Get history
    const history = await db.select().from(vanMessagesTable)
      .where(eq(vanMessagesTable.vanApplicationId, appId))
      .orderBy(vanMessagesTable.createdAt);

    // Save user message
    await db.insert(vanMessagesTable).values({
      vanApplicationId: appId,
      role: "user",
      content: message,
    });

    // Build OpenAI messages
    const openaiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: VAN_SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
    });

    const aiText = completion.choices[0]?.message?.content ?? "申し訳ありません、もう一度お試しください。";
    const options = parseOptions(aiText);
    const inquiry = parseVanInquiry(aiText);
    const cleanedText = cleanText(aiText);

    // Save AI message
    await db.insert(vanMessagesTable).values({
      vanApplicationId: appId,
      role: "assistant",
      content: aiText,
    });

    // Update application if inquiry complete
    if (inquiry && app.status === "相談中") {
      await db.update(vanApplicationsTable).set({
        status: "確認中",
        area: (inquiry.area as string) ?? app.area,
        startDate: (inquiry.startDate as string) ?? app.startDate,
        monthlyBudget: (inquiry.monthlyBudget as number) ?? app.monthlyBudget,
        purpose: (inquiry.purpose as string) ?? app.purpose,
        durationMonths: (inquiry.durationMonths as number) ?? app.durationMonths,
        insuranceStatus: (inquiry.insuranceStatus as string) ?? app.insuranceStatus,
        hasBlackNumber: (inquiry.hasBlackNumber as boolean) ?? app.hasBlackNumber,
        hasDeliveryExperience: (inquiry.hasDeliveryExperience as boolean) ?? app.hasDeliveryExperience,
        applicantName: (inquiry.applicantName as string) ?? app.applicantName,
        phone: (inquiry.phone as string) ?? app.phone,
        email: (inquiry.email as string) ?? app.email,
        updatedAt: new Date(),
      }).where(eq(vanApplicationsTable.id, appId));

      // Notify admin
      const admins = await db.select({ id: usersTable.id })
        .from(usersTable).where(eq(usersTable.role, "admin"));
      for (const admin of admins) {
        await db.insert(notificationsTable).values({
          userId: admin.id,
          message: `軽バン相談が完了しました（ID: ${appId} / ${inquiry.applicantName}様）`,
          title: 'Chat VAN相談',
        });
      }
    }

    return res.json({
      message: cleanedText,
      options,
      isComplete: !!inquiry,
      inquiry: inquiry ?? null,
    });
  } catch (err) {
    console.error("send van message error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/applications ──────────────────────────────────────────────────
router.get("/van/applications", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, page = "1", limit = "20" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = status
      ? eq(vanApplicationsTable.status, status as any)
      : undefined;

    const [apps, [countRow]] = await Promise.all([
      db.select().from(vanApplicationsTable)
        .where(whereClause)
        .orderBy(desc(vanApplicationsTable.createdAt))
        .limit(parseInt(limit))
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable)
        .where(whereClause),
    ]);

    return res.json({ applications: apps, total: Number(countRow.count) });
  } catch (err) {
    console.error("list applications error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/applications/:id ──────────────────────────────────────────────
router.get("/van/applications/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, id));
    if (!app) return res.status(404).json({ error: "Not found" });

    // Get latest proposal with vehicles
    let proposedVehicles = null;
    const [proposal] = await db.select().from(vanProposalsTable)
      .where(eq(vanProposalsTable.applicationId, id))
      .orderBy(desc(vanProposalsTable.createdAt))
      .limit(1);

    if (proposal) {
      const vehicleIds: number[] = JSON.parse(proposal.vehicleIds);
      if (vehicleIds.length > 0) {
        proposedVehicles = await db.select({
          vehicle: vehiclesTable,
          company: rentalCompaniesTable,
        }).from(vehiclesTable)
          .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
          .where(inArray(vehiclesTable.id, vehicleIds));
        proposedVehicles = proposedVehicles.map(({ vehicle, company }) => ({
          ...vehicle,
          userPrice: Number(vehicle.monthlyPrice) + Number(vehicle.sinJapanFee ?? 0) + Number(vehicle.insuranceFee ?? 0),
          rentalCompany: company,
        }));
      }
    }

    return res.json({ ...app, proposedVehicles });
  } catch (err) {
    console.error("get application error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /van/applications/:id ────────────────────────────────────────────
router.patch("/van/applications/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const updates = { ...req.body, updatedAt: new Date() };
    const [updated] = await db.update(vanApplicationsTable)
      .set(updates).where(eq(vanApplicationsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("update application error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/propose ────────────────────────────────────
router.post("/van/applications/:id/propose", requireAuth, requireAdmin, async (req, res) => {
  try {
    const appId = parseInt(String(req.params.id));
    const { vehicleIds, message } = req.body as { vehicleIds: number[]; message?: string };

    // Create proposal
    await db.insert(vanProposalsTable).values({
      applicationId: appId,
      vehicleIds: JSON.stringify(vehicleIds),
      message: message ?? null,
    });

    // Update application status
    const [app] = await db.update(vanApplicationsTable)
      .set({ status: "提案送信済", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId))
      .returning();

    // Notify user
    if (app?.userId) {
      await db.insert(notificationsTable).values({
        userId: app.userId,
        message: "Chat VANから軽バンのご提案が届きました",
        title: 'Chat VAN通知',
      });
    }

    // Add proposal message to chat
    const vehicles = await db.select().from(vehiclesTable)
      .where(inArray(vehiclesTable.id, vehicleIds));
    const vehicleText = vehicles.map((v) =>
      `▼ ${v.maker} ${v.model}\n月額: ¥${(Number(v.monthlyPrice) + Number(v.sinJapanFee ?? 0)).toLocaleString()}/月\nエリア: ${v.prefecture ?? ""}\n最低期間: ${v.minPeriodMonths}ヶ月\n利用可能: ${v.availableFrom ?? "即日相談可"}`
    ).join("\n\n");

    const proposalMessage = `条件に合う車両をご提案します。\n\n${vehicleText}\n\n${message ?? ""}`;
    await db.insert(vanMessagesTable).values({
      vanApplicationId: appId,
      role: "assistant",
      content: proposalMessage,
    });

    return res.json(app);
  } catch (err) {
    console.error("propose error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/applications/:id/accept ─────────────────────────────────────
router.post("/van/applications/:id/accept", requireAuth, async (req, res) => {
  try {
    const appId = parseInt(String(req.params.id));
    const { vehicleId } = req.body as { vehicleId: number };
    const [app] = await db.update(vanApplicationsTable)
      .set({ status: "申込受付", updatedAt: new Date() })
      .where(eq(vanApplicationsTable.id, appId))
      .returning();
    if (!app) return res.status(404).json({ error: "Not found" });

    // Notify admin
    const admins = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        message: `車両提案が承認されました（申込ID: ${appId}）`,
        title: 'Chat VAN相談',
      });
    }

    return res.json(app);
  } catch (err) {
    console.error("accept error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/dashboard ────────────────────────────────────────────────────
router.get("/van/dashboard", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [
      [newConsultations],
      [pendingReview],
      [proposalSent],
      [activeApplications],
      [activeContracts],
      [returningSoon],
      [totalVehicles],
      [availableVehicles],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable)
        .where(eq(vanApplicationsTable.status, "相談中")),
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable)
        .where(eq(vanApplicationsTable.status, "確認中")),
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable)
        .where(eq(vanApplicationsTable.status, "提案送信済")),
      db.select({ count: sql<number>`count(*)` }).from(vanApplicationsTable)
        .where(inArray(vanApplicationsTable.status, ["申込受付", "審査中", "提案確定", "契約手続き"] as any[])),
      db.select({ count: sql<number>`count(*)` }).from(vanContractsTable)
        .where(inArray(vanContractsTable.status, ["利用中"] as any[])),
      db.select({ count: sql<number>`count(*)` }).from(vanContractsTable)
        .where(eq(vanContractsTable.status, "返却予定" as any)),
      db.select({ count: sql<number>`count(*)` }).from(vehiclesTable),
      db.select({ count: sql<number>`count(*)` }).from(vehiclesTable)
        .where(eq(vehiclesTable.status, "募集中")),
    ]);

    const [revenueRow] = await db.select({
      total: sql<number>`coalesce(sum(monthly_price), 0)`,
    }).from(vanContractsTable).where(eq(vanContractsTable.status, "利用中" as any));

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
    });
  } catch (err) {
    console.error("dashboard error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/contracts ────────────────────────────────────────────────────
router.get("/van/contracts", requireAuth, async (req, res) => {
  try {
    const userId: number | undefined = (req.session as any)?.userId;
    const user = req.query.userId ? parseInt(req.query.userId as string) : userId;
    const { status } = req.query as { status?: string };

    const rows = await db.select({
      contract: vanContractsTable,
      vehicle: vehiclesTable,
      company: rentalCompaniesTable,
    }).from(vanContractsTable)
      .leftJoin(vehiclesTable, eq(vanContractsTable.vehicleId, vehiclesTable.id))
      .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .where(and(
        user ? eq(vanContractsTable.userId, user) : undefined,
        status ? eq(vanContractsTable.status, status as any) : undefined,
      ))
      .orderBy(desc(vanContractsTable.createdAt));

    return res.json(rows.map(({ contract, vehicle, company }) => ({
      ...contract,
      vehicle: vehicle ? { ...vehicle, rentalCompany: company } : null,
    })));
  } catch (err) {
    console.error("list contracts error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/contracts/:id ────────────────────────────────────────────────
router.get("/van/contracts/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [row] = await db.select({
      contract: vanContractsTable,
      vehicle: vehiclesTable,
      company: rentalCompaniesTable,
    }).from(vanContractsTable)
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

// ── PATCH /van/contracts/:id ──────────────────────────────────────────────
router.patch("/van/contracts/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db.update(vanContractsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(vanContractsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("update contract error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/rental-companies ─────────────────────────────────────────────
router.get("/van/rental-companies", requireAuth, async (req, res) => {
  try {
    const companies = await db.select({
      company: rentalCompaniesTable,
      vehicleCount: sql<number>`count(${vehiclesTable.id})`,
    }).from(rentalCompaniesTable)
      .leftJoin(vehiclesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .groupBy(rentalCompaniesTable.id)
      .orderBy(rentalCompaniesTable.name);
    return res.json(companies.map(({ company, vehicleCount }) => ({ ...company, vehicleCount: Number(vehicleCount) })));
  } catch (err) {
    console.error("list rental companies error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/rental-companies ────────────────────────────────────────────
router.post("/van/rental-companies", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [company] = await db.insert(rentalCompaniesTable).values(req.body).returning();
    return res.status(201).json(company);
  } catch (err) {
    console.error("create rental company error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/rental-companies/:id ─────────────────────────────────────────
router.get("/van/rental-companies/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [company] = await db.select().from(rentalCompaniesTable).where(eq(rentalCompaniesTable.id, id));
    if (!company) return res.status(404).json({ error: "Not found" });
    return res.json(company);
  } catch (err) {
    console.error("get rental company error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /van/rental-companies/:id ──────────────────────────────────────
router.patch("/van/rental-companies/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db.update(rentalCompaniesTable)
      .set(req.body).where(eq(rentalCompaniesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("update rental company error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── DELETE /van/rental-companies/:id ─────────────────────────────────────
router.delete("/van/rental-companies/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(rentalCompaniesTable).where(eq(rentalCompaniesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    console.error("delete rental company error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/vehicles ─────────────────────────────────────────────────────
router.get("/van/vehicles", requireAuth, async (req, res) => {
  try {
    const { status, prefecture, rentalCompanyId } = req.query as Record<string, string>;
    const rows = await db.select({
      vehicle: vehiclesTable,
      company: rentalCompaniesTable,
    }).from(vehiclesTable)
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
    console.error("list vehicles error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /van/vehicles ────────────────────────────────────────────────────
router.post("/van/vehicles", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [vehicle] = await db.insert(vehiclesTable).values(req.body).returning();
    return res.status(201).json(vehicle);
  } catch (err) {
    console.error("create vehicle error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /van/vehicles/:id ─────────────────────────────────────────────────
router.get("/van/vehicles/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [row] = await db.select({
      vehicle: vehiclesTable,
      company: rentalCompaniesTable,
    }).from(vehiclesTable)
      .leftJoin(rentalCompaniesTable, eq(vehiclesTable.rentalCompanyId, rentalCompaniesTable.id))
      .where(eq(vehiclesTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({
      ...row.vehicle,
      userPrice: Number(row.vehicle.monthlyPrice) + Number(row.vehicle.sinJapanFee ?? 0) + Number(row.vehicle.insuranceFee ?? 0),
      rentalCompany: row.company,
    });
  } catch (err) {
    console.error("get vehicle error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /van/vehicles/:id ───────────────────────────────────────────────
router.patch("/van/vehicles/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db.update(vehiclesTable)
      .set(req.body).where(eq(vehiclesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("update vehicle error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── DELETE /van/vehicles/:id ──────────────────────────────────────────────
router.delete("/van/vehicles/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(vehiclesTable).where(eq(vehiclesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    console.error("delete vehicle error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
