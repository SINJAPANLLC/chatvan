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

## 選択肢ボタン（全ての質問に必須）
質問するときは必ず選択肢を出力する:
<options>["選択肢A", "選択肢B", "選択肢C"]</options>

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

async function getSystemPrompt(): Promise<string> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_system_prompt"));
    if (row?.value) return row.value;
  } catch { /* ignore */ }
  return VAN_SYSTEM_PROMPT;
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
router.post("/van/start", async (req: Request, res: Response) => {
  try {
    const { message } = req.body as { message: string };
    if (!message?.trim()) return res.status(400).json({ error: "message required" });
    const userId: number | undefined = (req.session as any)?.userId;

    const [app] = await db.insert(vanApplicationsTable).values({
      userId: userId ?? null,
      status: "new",
      requestText: message,
    }).returning();

    await db.insert(vanMessagesTable).values({ vanApplicationId: app.id, role: "user", content: message });

    const systemPrompt = await getSystemPrompt();
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
        applicantName: inquiry.applicantName as string,
        phone: inquiry.phone as string,
        email: inquiry.email as string,
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
router.post("/van/applications/:id/messages", async (req: Request, res: Response) => {
  try {
    const appId = parseInt(String(req.params.id));
    const { message } = req.body as { message: string };
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    const [app] = await db.select().from(vanApplicationsTable).where(eq(vanApplicationsTable.id, appId));
    if (!app) return res.status(404).json({ error: "Application not found" });

    const history = await db.select().from(vanMessagesTable)
      .where(eq(vanMessagesTable.vanApplicationId, appId))
      .orderBy(vanMessagesTable.createdAt);

    await db.insert(vanMessagesTable).values({ vanApplicationId: appId, role: "user", content: message });

    const systemPrompt = await getSystemPrompt();
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
      await db.update(vanApplicationsTable).set({
        status: "hearing",
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

      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
      for (const admin of admins) {
        await db.insert(notificationsTable).values({
          userId: admin.id,
          message: `軽バン相談が完了しました（ID: ${appId} / ${inquiry.applicantName}様）`,
          title: 'Chat VAN相談',
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
    if (!isValidObjectPath(b.license_front) || !isValidObjectPath(b.license_back)) {
      return res.status(400).json({ error: "Invalid document path" });
    }

    // Verify upload ownership — both paths must have been issued to this user
    const claimRows = await db.execute(sql`
      SELECT object_path FROM upload_claims
      WHERE object_path IN (${b.license_front}, ${b.license_back})
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
        emergencyContactName: b.emergency_contact_name, emergencyContactPhone: b.emergency_contact_phone,
        emergencyContactRelation: b.emergency_contact_relation,
        status: 'submitted' as any, rejectionReason: null, updatedAt: new Date(),
      }).where(eq(identityVerificationsTable.id, existing[0].id)).returning();
    } else {
      [result] = await db.insert(identityVerificationsTable).values({
        userId: userId!,
        applicationId: appId,
        fullName: b.full_name, birthDate: b.birth_date, address: b.address, phone: b.phone,
        email: b.email, licenseFront: b.license_front, licenseBack: b.license_back,
        licenseExpiry: b.license_expiry, licenseType: b.license_type, licenseNumber: b.license_number,
        emergencyContactName: b.emergency_contact_name, emergencyContactPhone: b.emergency_contact_phone,
        emergencyContactRelation: b.emergency_contact_relation, status: 'submitted',
      }).returning();
    }

    // Mark claims as used
    await db.execute(sql`
      UPDATE upload_claims SET used_at = NOW()
      WHERE object_path IN (${b.license_front}, ${b.license_back}) AND user_id = ${userId!}
    `);

    // Notify admin
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id, title: 'Chat VAN - 免許証提出',
        message: `免許証の確認依頼が届きました（相談ID: ${appId}）`,
      });
    }
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

export default router;
