/**
 * 通知ヘルパー — アプリ内通知＋メール送信を一括で行う共通関数
 */
import { db, notificationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendEmail, buildEmailHtml } from "./email";
import { logger } from "./logger";

type EmailDeliveryStatus = "sent" | "failed" | "skipped";

export type AdminNotificationSummary = {
  adminCount: number;
  created: number;
  sent: number;
  failed: number;
  skipped: number;
};

function toRows(raw: unknown): any[] {
  return (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
}

function toDeliveryStatus(result: { sent: boolean; reason?: string }): EmailDeliveryStatus {
  if (result.sent) return "sent";
  return result.reason?.includes("SMTP未設定") ? "skipped" : "failed";
}

/** 特定ユーザーにアプリ内通知＋メールを送る */
export async function notifyUser(userId: number, title: string, message: string) {
  await db.insert(notificationsTable).values({ userId, title, message });
  const raw = await db.execute(sql`SELECT email, name FROM users WHERE id = ${userId} LIMIT 1`);
  const u = toRows(raw)[0];
  if (u?.email) {
    const html = buildEmailHtml({ subject: title, body: message, recipientName: u.name ?? undefined });
    sendEmail(u.email, `【SIN JAPAN】${title}`, html).catch(() => {});
  }
}

/**
 * 管理者全員へアプリ内通知を作成し、各メールの送信結果も同じ通知レコードに記録する。
 * 通知基盤の失敗で、申請・登録など本来の業務イベントを失敗させない。
 */
export async function notifyAdmins(title: string, message: string): Promise<AdminNotificationSummary> {
  const summary: AdminNotificationSummary = {
    adminCount: 0,
    created: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  let admins: any[];
  try {
    const raw = await db.execute(sql`SELECT id, email, name FROM users WHERE role = 'admin'`);
    admins = toRows(raw);
  } catch (error) {
    logger.error({ err: error, title }, "[ADMIN NOTIFICATION] 管理者一覧の取得に失敗しました");
    summary.failed += 1;
    return summary;
  }

  summary.adminCount = admins.length;
  if (admins.length === 0) {
    logger.error({ title }, "[ADMIN NOTIFICATION] 送信対象の管理者が見つかりません");
    summary.failed += 1;
    return summary;
  }

  for (const admin of admins) {
    const email = typeof admin.email === "string" ? admin.email.trim() : "";
    let notificationId: number | undefined;
    try {
      const [notification] = await db.insert(notificationsTable).values({
        userId: admin.id,
        title,
        message,
        readStatus: false,
        emailStatus: email ? "sending" : "skipped",
        emailError: email ? null : "管理者のメールアドレスが未登録です",
        emailAttemptCount: email ? 1 : 0,
        emailAttemptStartedAt: email ? new Date() : null,
      }).returning({ id: notificationsTable.id });
      notificationId = notification.id;
      summary.created += 1;

      if (!email) {
        summary.skipped += 1;
        continue;
      }

      let result: { sent: boolean; reason?: string };
      try {
        const html = buildEmailHtml({ subject: title, body: message, recipientName: admin.name ?? undefined });
        result = await sendEmail(email, `【Chat VAN】${title}`, html);
      } catch (error: any) {
        result = { sent: false, reason: error?.message ?? "メール送信に失敗しました" };
      }

      const status = toDeliveryStatus(result);
      try {
        await db.update(notificationsTable).set({
          emailStatus: status,
          emailError: result.sent ? null : result.reason ?? "メール送信に失敗しました",
          emailSentAt: result.sent ? new Date() : null,
          emailAttemptStartedAt: null,
        }).where(eq(notificationsTable.id, notification.id));
      } catch (error) {
        // 送信後に状態を保存できなかった場合は、送信中のまま固定しない。
        // メールが届いている可能性はあるが、管理画面から再送・確認できる状態を優先する。
        summary.failed += 1;
        logger.error({ err: error, notificationId, title }, "[ADMIN NOTIFICATION] メール送信結果を保存できませんでした");
        try {
          await db.update(notificationsTable).set({
            emailStatus: "failed",
            emailError: "メール送信後の状態保存に失敗しました。配信結果を確認のうえ必要に応じて再送してください。",
            emailAttemptStartedAt: null,
          }).where(eq(notificationsTable.id, notification.id));
        } catch (fallbackError) {
          logger.error({ err: fallbackError, notificationId, title }, "[ADMIN NOTIFICATION] 送信失敗状態への復旧にも失敗しました");
        }
        continue;
      }

      summary[status] += 1;
    } catch (error) {
      summary.failed += 1;
      if (notificationId) {
        try {
          await db.update(notificationsTable).set({
            emailStatus: "failed",
            emailError: "通知処理中にエラーが発生しました。必要に応じて再送してください。",
            emailAttemptStartedAt: null,
          }).where(eq(notificationsTable.id, notificationId));
        } catch (fallbackError) {
          logger.error({ err: fallbackError, notificationId, title }, "[ADMIN NOTIFICATION] 失敗状態への復旧に失敗しました");
        }
      }
      logger.error({
        adminId: admin.id,
        title,
        err: error,
      }, "[ADMIN NOTIFICATION] 通知の作成または送信結果の記録に失敗しました");
    }
  }
  return summary;
}

/** 協力会社ユーザー全員にアプリ内通知＋メールを送る。ユーザー未登録時は会社登録メールへ送る。 */
export async function notifyRcUsers(rcId: number, title: string, message: string): Promise<number> {
  const raw = await db.execute(sql`SELECT id, email, name FROM users WHERE rental_company_id = ${rcId}`);
  const users = toRows(raw);
  for (const u of users) {
    await db.insert(notificationsTable).values({ userId: (u as any).id, title, message });
    const email = (u as any).email;
    if (email) {
      const html = buildEmailHtml({ subject: title, body: message, recipientName: (u as any).name ?? undefined });
      sendEmail(email, `【SIN JAPAN】${title}`, html).catch(() => {});
    }
  }
  if (users.length > 0) return users.length;

  const companyRaw = await db.execute(sql`SELECT email, name FROM rental_companies WHERE id = ${rcId} LIMIT 1`);
  const company = toRows(companyRaw)[0];
  if (company?.email) {
    const html = buildEmailHtml({ subject: title, body: message, recipientName: company.name ?? undefined });
    sendEmail(company.email, `【SIN JAPAN】${title}`, html).catch(() => {});
    return 1;
  }
  return 0;
}
