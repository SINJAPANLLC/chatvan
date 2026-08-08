import { Router, type IRouter } from "express";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { sendEmail, buildEmailHtml } from "../lib/email";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatNotification(n: any) {
  return {
    ...n,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
  };
}

// ── ユーザー向け ──────────────────────────────────────────────────────────────

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.session.userId!))
    .orderBy(desc(notificationsTable.createdAt));
  res.json(notifications.map(formatNotification));
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [notif] = await db
    .update(notificationsTable)
    .set({ readStatus: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.session.userId!)))
    .returning();

  if (!notif) { res.status(404).json({ error: "通知が見つかりません" }); return; }
  res.json(formatNotification(notif));
});

// ── 管理者向け ────────────────────────────────────────────────────────────────

// GET /admin/notifications — 送信済み通知の履歴
router.get("/admin/notifications", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id:         notificationsTable.id,
    title:      notificationsTable.title,
    message:    notificationsTable.message,
    readStatus: notificationsTable.readStatus,
    createdAt:  notificationsTable.createdAt,
    userName:   usersTable.name,
    userEmail:  usersTable.email,
    companyName:usersTable.companyName,
  }).from(notificationsTable)
    .leftJoin(usersTable, eq(notificationsTable.userId, usersTable.id))
    .orderBy(desc(notificationsTable.createdAt));

  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  })));
});

// POST /admin/shipments/:id/notify-price-approval — 値引き承認通知
router.post("/admin/shipments/:id/notify-price-approval", requireAdmin, async (req, res): Promise<void> => {
  const shipmentId = parseInt(req.params.id, 10);
  if (isNaN(shipmentId)) { res.status(400).json({ error: "無効なID" }); return; }

  const { customPrice, message: customMsg } = req.body as { customPrice?: number; message?: string };

  // 案件と顧客を取得
  const { shipmentsTable } = await import("@workspace/db");
  const [shipment] = await db
    .select({ id: shipmentsTable.id, userId: shipmentsTable.userId, customerPrice: shipmentsTable.customerPrice })
    .from(shipmentsTable)
    .where(eq(shipmentsTable.id, shipmentId));

  if (!shipment) { res.status(404).json({ error: "案件が見つかりません" }); return; }
  if (!shipment.userId) { res.status(400).json({ error: "顧客情報がありません" }); return; }

  // 金額を更新（値引き後の金額が指定された場合）
  if (customPrice && customPrice > 0) {
    await db.update(shipmentsTable)
      .set({ customerPrice: customPrice.toString() as any })
      .where(eq(shipmentsTable.id, shipmentId));
  }

  const priceLabel = customPrice
    ? `¥${new Intl.NumberFormat('ja-JP').format(customPrice)}`
    : `¥${new Intl.NumberFormat('ja-JP').format(Number(shipment.customerPrice))}`;

  const title = `案件 #${shipmentId} 値引き承認のお知らせ`;
  const body = customMsg || `案件 #${shipmentId} の配送料金を ${priceLabel}（税別）にてご対応できることになりました。ご確認のうえ、ご依頼をお進めください。`;

  // DB通知レコード
  const [notif] = await db.insert(notificationsTable).values({
    userId: shipment.userId,
    shipmentId,
    title,
    message: body,
    readStatus: false,
  }).returning();

  // メール送信
  const [user] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, shipment.userId));

  if (user) {
    const html = buildEmailHtml(title, body, user.name ?? undefined);
    await sendEmail(user.email, title, html);
  }

  res.json({ ok: true, notificationId: notif.id });
});

// POST /admin/notifications/send — 通知メール送信
// body: { userIds?: number[], sendAll?: boolean, subject, body }
router.post("/admin/notifications/send", requireAdmin, async (req, res): Promise<void> => {
  const { userIds, sendAll, subject, body } = req.body;

  if (!subject || !body) {
    res.status(400).json({ error: "件名と本文を入力してください" });
    return;
  }

  // 送信対象ユーザーを取得
  let users;
  if (sendAll) {
    users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.role, "user"));
  } else if (Array.isArray(userIds) && userIds.length > 0) {
    users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(inArray(usersTable.id, userIds.map(Number)));
  } else {
    res.status(400).json({ error: "送信対象を指定してください" });
    return;
  }

  if (users.length === 0) {
    res.status(400).json({ error: "送信対象のユーザーが見つかりません" });
    return;
  }

  const results: { userId: number; email: string; sent: boolean; reason?: string }[] = [];

  for (const user of users) {
    // DB通知レコード保存
    await db.insert(notificationsTable).values({
      userId:    user.id,
      shipmentId: null as any,
      title:     subject,
      message:   body,
      readStatus: false,
    });

    // メール送信
    const html = buildEmailHtml(subject, body, user.name ?? undefined);
    const result = await sendEmail(user.email, subject, html);
    results.push({ userId: user.id, email: user.email, ...result });
  }

  const sentCount = results.filter(r => r.sent).length;
  res.json({
    message: `${users.length}件に通知を作成、${sentCount}件のメール送信成功`,
    results,
  });
});

export default router;
