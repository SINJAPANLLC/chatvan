/**
 * 通知ヘルパー — アプリ内通知＋メール送信を一括で行う共通関数
 */
import { db, emailSendLogsTable, notificationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendEmail, buildEmailHtml, brandedEmailSubject, type EmailBrand } from "./email";
import { logger } from "./logger";

type EmailDeliveryStatus = "sent" | "failed" | "skipped";
type NotificationOptions = { dedupeKey?: string; brand?: EmailBrand };

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

async function deliverToAccount(input: {
  userId: number;
  email?: string | null;
  name?: string | null;
  title: string;
  message: string;
  dedupeKey?: string;
  brand?: EmailBrand;
}): Promise<EmailDeliveryStatus | "duplicate" | "failed"> {
  try {
    const email = input.email?.trim() ?? "";
    // Partial UNIQUE(user_id, dedupe_key) と ON CONFLICT を使い、複数プロセスでも
    // 「確認→作成」の間に二重送信されないように、通知レコードを原子的に確保する。
    const raw = await db.execute(sql`
      INSERT INTO notifications (
        user_id, title, message, dedupe_key, email_status, email_error,
        email_attempt_count, email_attempt_started_at
      )
      VALUES (
        ${input.userId}, ${input.title}, ${input.message}, ${input.dedupeKey ?? null},
        ${email ? "sending" : "skipped"},
        ${email ? null : "メールアドレスが未登録です"},
        ${email ? 1 : 0},
        ${email ? new Date() : null}
      )
      ${input.dedupeKey
        ? sql`ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`
        : sql``}
      RETURNING id
    `);
    const notification = toRows(raw)[0];
    if (!notification) return "duplicate";

    if (!email) return "skipped";

    const result = await sendEmail(
      email,
      brandedEmailSubject(input.title, input.brand),
      buildEmailHtml({ subject: input.title, body: input.message, recipientName: input.name ?? undefined, brand: input.brand }),
    );
    const status = toDeliveryStatus(result);
    await db.update(notificationsTable).set({
      emailStatus: status,
      emailError: result.sent ? null : result.reason ?? "メール送信に失敗しました",
      emailSentAt: result.sent ? new Date() : null,
      emailAttemptStartedAt: null,
    }).where(eq(notificationsTable.id, notification.id));
    return status;
  } catch (error) {
    logger.error({ err: error, userId: input.userId, title: input.title }, "[NOTIFICATION] 利用者通知に失敗しました");
    return "failed";
  }
}

/** 特定アカウントにアプリ内通知とメールを送り、メール結果を通知履歴へ記録する。 */
export async function notifyUser(userId: number, title: string, message: string, options: NotificationOptions = {}) {
  const raw = await db.execute(sql`SELECT email, name FROM users WHERE id = ${userId} LIMIT 1`);
  const u = toRows(raw)[0];
  if (!u) return "failed" as const;
  return deliverToAccount({
    userId,
    email: u.email,
    name: u.name,
    title,
    message,
    dedupeKey: options.dedupeKey,
    brand: options.brand,
  });
}

/** メールを伴わないアプリ内通知。問い合わせのゲスト宛メールなどと併用する。 */
export async function notifyUserInApp(userId: number, title: string, message: string, options: NotificationOptions = {}) {
  try {
    const raw = await db.execute(sql`
      INSERT INTO notifications (user_id, title, message, dedupe_key, email_status)
      VALUES (${userId}, ${title}, ${message}, ${options.dedupeKey ?? null}, 'not_requested')
      ${options.dedupeKey
        ? sql`ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`
        : sql``}
      RETURNING id
    `);
    if (!toRows(raw)[0]) return "duplicate" as const;
    return "created" as const;
  } catch (error) {
    logger.error({ err: error, userId, title }, "[NOTIFICATION] アプリ内通知に失敗しました");
    return "failed" as const;
  }
}

/**
 * アカウントを持たない問い合わせ者・レンタル会社代表メール向けの記録付き配信。
 * attempt_key の一意制約で重複を防ぎ、送信成否は email_send_logs に必ず残す。
 */
export async function notifyExternalEmail(input: {
  email: string;
  recipientName?: string | null;
  title: string;
  message: string;
  attemptKey?: string;
  companyName?: string | null;
  brand?: EmailBrand;
}): Promise<EmailDeliveryStatus | "duplicate" | "failed"> {
  const email = input.email.trim();
  if (!email) return "skipped";
  try {
    const values = {
      prospectId: null,
      prospectType: "notification",
      attemptKey: input.attemptKey ?? null,
      email,
      companyName: input.companyName ?? null,
      subject: brandedEmailSubject(input.title, input.brand),
      bodyText: input.message,
      sent: false,
      reason: "送信中",
      sentAt: new Date(),
    };
    // attempt_keyごとに、新規・失敗・15分以上前の送信中レコードのいずれかを
    // 1プロセスだけが取得する。これにより失敗時は再送でき、同時実行では重複しない。
    const raw = input.attemptKey
      ? await db.execute(sql`
        WITH inserted AS (
          INSERT INTO email_send_logs (
            prospect_id, prospect_type, attempt_key, email, company_name,
            subject, body_text, sent, reason, sent_at
          )
          VALUES (
            NULL, 'notification', ${values.attemptKey}, ${values.email}, ${values.companyName},
            ${values.subject}, ${values.bodyText}, false, '送信中', NOW()
          )
          ON CONFLICT (attempt_key) WHERE attempt_key IS NOT NULL DO NOTHING
          RETURNING id
        ),
        reclaimed AS (
          UPDATE email_send_logs
          SET sent = false, reason = '送信中', sent_at = NOW()
          WHERE attempt_key = ${values.attemptKey}
            AND sent = false
            AND (reason IS DISTINCT FROM '送信中' OR sent_at < NOW() - INTERVAL '15 minutes')
            AND NOT EXISTS (SELECT 1 FROM inserted)
          RETURNING id
        )
        SELECT id FROM inserted
        UNION ALL
        SELECT id FROM reclaimed
      `)
      : await db.execute(sql`
        INSERT INTO email_send_logs (
          prospect_id, prospect_type, attempt_key, email, company_name,
          subject, body_text, sent, reason, sent_at
        )
        VALUES (
          NULL, 'notification', NULL, ${values.email}, ${values.companyName},
          ${values.subject}, ${values.bodyText}, false, '送信中', NOW()
        )
        RETURNING id
      `);
    const log = toRows(raw)[0];
    if (!log) return "duplicate";

    let result: { sent: boolean; reason?: string };
    try {
      result = await sendEmail(
        email,
        values.subject,
        buildEmailHtml({
          subject: input.title,
          body: input.message,
          recipientName: input.recipientName ?? undefined,
          brand: input.brand,
        }),
      );
    } catch (error: any) {
      const reason = error?.message ?? "メール送信処理中にエラーが発生しました";
      await db.update(emailSendLogsTable).set({ sent: false, reason, sentAt: new Date() })
        .where(eq(emailSendLogsTable.id, log.id)).catch((updateError) => {
          logger.error({ err: updateError, logId: log.id }, "[NOTIFICATION] 外部メール失敗状態を保存できませんでした");
        });
      return "failed";
    }
    const status = toDeliveryStatus(result);
    try {
      await db.update(emailSendLogsTable).set({
        sent: result.sent,
        reason: result.sent ? null : result.reason ?? "メール送信に失敗しました",
        sentAt: new Date(),
      }).where(eq(emailSendLogsTable.id, log.id));
    } catch (error) {
      // sendEmailの成功後に記録だけが失敗した場合、二重送信を避けるため
      // 自動再送対象には戻さず、障害をログに残す。
      logger.error({ err: error, logId: log.id }, "[NOTIFICATION] 外部メール送信結果を保存できませんでした");
      return "failed";
    }
    return status;
  } catch (error) {
    logger.error({ err: error, email, title: input.title }, "[NOTIFICATION] 外部メール通知に失敗しました");
    return "failed";
  }
}

/** オーナーが把握する重要イベントを、通常の管理者通知とは別に送る。 */
export async function notifyCriticalEmail(
  eventKey: string,
  title: string,
  message: string,
): Promise<EmailDeliveryStatus | "duplicate" | "failed"> {
  const email = process.env.CRITICAL_NOTIFICATION_EMAIL?.trim();
  if (!email) {
    logger.error({ eventKey, title }, "[CRITICAL NOTIFICATION] 重要通知先が未設定です");
    return "failed";
  }
  return notifyExternalEmail({
    email,
    title,
    message,
    attemptKey: `chat-van:critical:${eventKey}`,
  });
}

/**
 * 管理者全員へアプリ内通知を作成し、各メールの送信結果も同じ通知レコードに記録する。
 * 通知基盤の失敗で、申請・登録など本来の業務イベントを失敗させない。
 */
export async function notifyAdmins(
  title: string,
  message: string,
  options: NotificationOptions = {},
): Promise<AdminNotificationSummary> {
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
        const html = buildEmailHtml({
          subject: title,
          body: message,
          recipientName: admin.name ?? undefined,
          brand: options.brand,
        });
        result = await sendEmail(email, brandedEmailSubject(title, options.brand), html);
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
export async function notifyRcUsers(rcId: number, title: string, message: string, options: NotificationOptions = {}): Promise<number> {
  const raw = await db.execute(sql`SELECT id, email, name FROM users WHERE rental_company_id = ${rcId}`);
  const users = toRows(raw);
  let delivered = 0;
  for (const u of users) {
    const status = await deliverToAccount({
      userId: (u as any).id,
      email: (u as any).email,
      name: (u as any).name,
      title,
      message,
      dedupeKey: options.dedupeKey,
    });
    if (status !== "duplicate" && status !== "failed") delivered += 1;
  }
  if (users.length > 0) return delivered;

  const companyRaw = await db.execute(sql`SELECT email, name FROM rental_companies WHERE id = ${rcId} LIMIT 1`);
  const company = toRows(companyRaw)[0];
  if (company?.email) {
    const status = await notifyExternalEmail({
      email: company.email,
      recipientName: company.name,
      companyName: company.name,
      title,
      message,
      attemptKey: options.dedupeKey ? `${options.dedupeKey}:company-email` : undefined,
    });
    return status === "duplicate" || status === "failed" ? 0 : 1;
  }
  return 0;
}
