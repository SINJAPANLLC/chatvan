import { Router, type IRouter } from "express";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, ne, desc, inArray, count, ilike, or, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { sendEmail, buildEmailHtml } from "../lib/email";
import { logAdminAudit } from "../lib/auditLogger";

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

type DeliveryResult = {
  notificationId: number;
  userId: number;
  email: string;
  sent: boolean;
  status: "sent" | "failed" | "skipped";
  reason?: string;
};

function deliveryStatus(result: { sent: boolean; reason?: string }): DeliveryResult["status"] {
  if (result.sent) return "sent";
  return result.reason?.includes("SMTP未設定") ? "skipped" : "failed";
}

async function deliverAdminNotification(input: {
  userId: number;
  email: string;
  name?: string | null;
  title: string;
  message: string;
  shipmentId?: number | null;
}): Promise<DeliveryResult> {
  const [notification] = await db.insert(notificationsTable).values({
    userId: input.userId,
    shipmentId: input.shipmentId ?? null,
    title: input.title,
    message: input.message,
    readStatus: false,
    emailStatus: "sending",
    emailAttemptCount: 1,
  }).returning();

  try {
    const result = await sendEmail(input.email, input.title, buildEmailHtml(input.title, input.message, input.name ?? undefined));
    const status = deliveryStatus(result);
    await db.update(notificationsTable).set({
      emailStatus: status,
      emailError: result.sent ? null : result.reason ?? "メール送信に失敗しました",
      emailSentAt: result.sent ? new Date() : null,
    }).where(eq(notificationsTable.id, notification.id));
    return { notificationId: notification.id, userId: input.userId, email: input.email, status, ...result };
  } catch (error: any) {
    const reason = error?.message ?? "メール送信に失敗しました";
    await db.update(notificationsTable).set({ emailStatus: "failed", emailError: reason })
      .where(eq(notificationsTable.id, notification.id));
    return { notificationId: notification.id, userId: input.userId, email: input.email, sent: false, status: "failed", reason };
  }
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
router.get("/admin/notifications", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const filter = query
    ? or(
      ilike(notificationsTable.title, `%${query}%`),
      ilike(notificationsTable.message, `%${query}%`),
      ilike(usersTable.name, `%${query}%`),
      ilike(usersTable.email, `%${query}%`),
      ilike(usersTable.companyName, `%${query}%`),
    )
    : undefined;
  const rows = await db.select({
    id:         notificationsTable.id,
    title:      notificationsTable.title,
    message:    notificationsTable.message,
    readStatus: notificationsTable.readStatus,
    createdAt:  notificationsTable.createdAt,
    userName:   usersTable.name,
    userEmail:  usersTable.email,
    companyName:usersTable.companyName,
    emailStatus: notificationsTable.emailStatus,
    emailError: notificationsTable.emailError,
    emailSentAt: notificationsTable.emailSentAt,
    emailAttemptCount: notificationsTable.emailAttemptCount,
  }).from(notificationsTable)
    .leftJoin(usersTable, eq(notificationsTable.userId, usersTable.id))
    .where(filter)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db.select({ total: count() })
    .from(notificationsTable)
    .leftJoin(usersTable, eq(notificationsTable.userId, usersTable.id))
    .where(filter);

  res.json({
    notifications: rows.map(r => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      emailSentAt: r.emailSentAt instanceof Date ? r.emailSentAt.toISOString() : r.emailSentAt,
    })),
    total: Number(totalRow?.total ?? 0),
    limit,
    offset,
  });
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
  const [user] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, shipment.userId));

  if (!user) { res.status(404).json({ error: "送信先ユーザーが見つかりません" }); return; }
  const result = await deliverAdminNotification({
    userId: shipment.userId, email: user.email, name: user.name, title, message: body, shipmentId,
  });
  await logAdminAudit(req, {
    action: "send",
    targetType: "shipment_price_notification",
    targetId: shipmentId,
    afterData: { notificationId: result.notificationId, emailStatus: result.status, sent: result.sent },
  });
  res.json({ ok: true, notificationId: result.notificationId, result });
});

// POST /admin/notifications/send — 通知メール送信
// body: { userIds?: number[], sendAll?: boolean, subject, body }
router.post("/admin/notifications/send", requireAdmin, async (req, res): Promise<void> => {
  const { userIds, sendAll, subject, body } = req.body;

  if (typeof subject !== "string" || typeof body !== "string" || !subject.trim() || !body.trim()) {
    res.status(400).json({ error: "件名と本文を入力してください" });
    return;
  }
  if (subject.length > 200 || body.length > 5_000) {
    res.status(400).json({ error: "件名は200文字、本文は5,000文字以内にしてください" });
    return;
  }

  // 送信対象ユーザーを取得
  let users;
  if (sendAll) {
    users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.role, "user"));
  } else if (Array.isArray(userIds) && userIds.length > 0) {
    users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(inArray(usersTable.id, [...new Set(userIds.map(Number).filter(Number.isInteger))]));
  } else {
    res.status(400).json({ error: "送信対象を指定してください" });
    return;
  }

  if (users.length === 0) {
    res.status(400).json({ error: "送信対象のユーザーが見つかりません" });
    return;
  }

  const results: DeliveryResult[] = [];

  for (const user of users) {
    try {
      results.push(await deliverAdminNotification({
        userId: user.id, email: user.email, name: user.name, title: subject.trim(), message: body.trim(),
      }));
    } catch (error: any) {
      results.push({
        notificationId: 0, userId: user.id, email: user.email, sent: false, status: "failed",
        reason: error?.message ?? "通知の保存に失敗しました",
      });
    }
  }

  const sentCount = results.filter(r => r.sent).length;
  await logAdminAudit(req, {
    action: "send",
    targetType: "notification",
    targetId: "bulk",
    afterData: {
      recipients: users.length,
      sent: sentCount,
      failed: results.filter(r => r.status === "failed").length,
      skipped: results.filter(r => r.status === "skipped").length,
    },
  });
  res.json({
    message: `${users.length}件に通知を作成、${sentCount}件のメール送信成功`,
    results,
  });
});

// POST /admin/notifications/:id/resend — 失敗・未送信のメールだけを再送
router.post("/admin/notifications/:id/resend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "無効なIDです" }); return; }
  const [notification] = await db.select({
    id: notificationsTable.id,
    userId: notificationsTable.userId,
    title: notificationsTable.title,
    message: notificationsTable.message,
    shipmentId: notificationsTable.shipmentId,
    emailStatus: notificationsTable.emailStatus,
    emailAttemptCount: notificationsTable.emailAttemptCount,
    userName: usersTable.name,
    userEmail: usersTable.email,
  }).from(notificationsTable)
    .leftJoin(usersTable, eq(notificationsTable.userId, usersTable.id))
    .where(eq(notificationsTable.id, id))
    .limit(1);
  if (!notification || !notification.userEmail) { res.status(404).json({ error: "通知または送信先が見つかりません" }); return; }
  if (notification.emailStatus === "sent") { res.status(409).json({ error: "このメールはすでに送信済みです" }); return; }

  const [claimed] = await db.update(notificationsTable).set({
    emailStatus: "sending",
    emailError: null,
    emailAttemptCount: sql`COALESCE(${notificationsTable.emailAttemptCount}, 0) + 1`,
  }).where(and(
    eq(notificationsTable.id, id),
    ne(notificationsTable.emailStatus, "sent"),
    ne(notificationsTable.emailStatus, "sending"),
  )).returning({ id: notificationsTable.id });
  if (!claimed) {
    res.status(409).json({ error: "このメールはすでに送信済み、または送信処理中です" });
    return;
  }

  try {
    const result = await sendEmail(notification.userEmail, notification.title, buildEmailHtml(notification.title, notification.message, notification.userName ?? undefined));
    const status = deliveryStatus(result);
    await db.update(notificationsTable).set({
      emailStatus: status,
      emailError: result.sent ? null : result.reason ?? "メール送信に失敗しました",
      emailSentAt: result.sent ? new Date() : null,
    }).where(eq(notificationsTable.id, id));
    await logAdminAudit(req, { action: "resend", targetType: "notification", targetId: id, afterData: { status, sent: result.sent } });
    res.json({ notificationId: id, status, ...result });
  } catch (error: any) {
    const reason = error?.message ?? "メール送信に失敗しました";
    await db.update(notificationsTable).set({ emailStatus: "failed", emailError: reason }).where(eq(notificationsTable.id, id));
    res.status(502).json({ error: reason });
  }
});

export default router;
