/**
 * 案件ステータス変更時の自動通知ヘルパー
 */
import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail, buildEmailHtml } from "./email";
import { notifyAdmins } from "./notifyHelpers";
import { logger } from "./logger";

interface AutoNotifyPayload {
  shipmentId: number;
  userId: number;
  status: string;
  /** 案件の集荷先→納品先（任意・メール本文補足用） */
  route?: string;
}

// ステータス別：メール件名・本文・バッジ
const NOTIFY_MAP: Record<string, { subject: string; body: (route?: string) => string; cta: string } | null> = {
  "配車確定": {
    subject: "【Chat LOGI】配車が確定しました",
    body: (route) => `担当ドライバーの手配が完了いたしました。${route ? `\n\nルート：${route}` : ""}\n\n集荷日時が近づきましたら担当者よりご連絡いたします。\n引き続きよろしくお願いいたします。`,
    cta: "案件の詳細を確認する →",
  },
  "集荷完了": {
    subject: "【Chat LOGI】集荷が完了しました",
    body: (route) => `荷物の集荷が完了いたしました。${route ? `\n\nルート：${route}` : ""}\n\nこれより配送を開始いたします。\n進捗は随時マイページよりご確認いただけます。`,
    cta: "配送状況を確認する →",
  },
  "配送中": {
    subject: "【Chat LOGI】配送を開始しました",
    body: (route) => `荷物の配送を開始いたしました。${route ? `\n\nルート：${route}` : ""}\n\n到着予定時刻については担当者よりご連絡いたします。`,
    cta: "配送状況を確認する →",
  },
  "納品完了": {
    subject: "【Chat LOGI】納品が完了しました",
    body: (route) => `荷物が無事に納品完了いたしました。${route ? `\n\nルート：${route}` : ""}\n\nこのたびはChat LOGIをご利用いただきありがとうございました。\nご不明点がございましたらお気軽にお問い合わせください。`,
    cta: "案件の詳細を確認する →",
  },
  "請求完了": {
    subject: "【Chat LOGI】請求書を発行しました",
    body: () => `請求書を発行いたしました。\n\nマイページよりご確認・ダウンロードいただけます。\nご不明な点がございましたらお気軽にお問い合わせください。`,
    cta: "請求書を確認する →",
  },
  "キャンセル": {
    subject: "【Chat LOGI】案件がキャンセルされました",
    body: () => `案件のキャンセルが完了いたしました。\n\nご利用いただきありがとうございました。\nまたのご依頼をお待ちしております。`,
    cta: "マイページを確認する →",
  },
  // 通知しないステータス
  "受付中": null,
  "ヒアリング中": null,
  "見積提示": null,
  "顧客承認": null,
  "キャンセル申請中": null,
};

export async function sendAutoNotification(payload: AutoNotifyPayload): Promise<void> {
  const { shipmentId, userId, status, route } = payload;

  const rule = NOTIFY_MAP[status];
  if (!rule) return; // 通知不要なステータス

  const subject = rule.subject;
  const body = rule.body(route);
  let user: { name: string; email: string } | undefined;

  try {
    // ユーザー情報取得
    [user] = await db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  } catch (error) {
    logger.error({ err: error, shipmentId, userId }, "[AUTO NOTIFY] ユーザー情報の取得に失敗しました");
  }

  if (user) {
    // ユーザー向け通知の失敗は、管理者通知の発火を妨げない。
    try {
      await db.insert(notificationsTable).values({
        userId,
        shipmentId,
        title: subject,
        message: body,
        readStatus: false,
      });

      const html = buildEmailHtml({
        subject,
        body,
        recipientName: user.name ?? undefined,
        brand: "chatlogi",
        statusBadge: status,
        shipmentId,
        ctaText: rule.cta,
      });
      sendEmail(user.email, subject, html).catch((error) =>
        logger.error({ err: error, shipmentId, userId }, "[AUTO NOTIFY] ユーザーメールの送信に失敗しました")
      );
    } catch (error) {
      logger.error({ err: error, shipmentId, userId }, "[AUTO NOTIFY] ユーザー通知の保存に失敗しました");
    }
  } else {
    logger.error({ shipmentId, userId }, "[AUTO NOTIFY] ユーザーが見つからないためユーザー通知をスキップしました");
  }

  // BCC の固定宛先ではなく、全管理者にアプリ内通知と個別メールを送る。
  await notifyAdmins(`Chat LOGI - ${status}`, [
    `案件 #${shipmentId} のステータスが「${status}」に更新されました。`,
    route ? `ルート：${route}` : "",
  ].filter(Boolean).join("\n"), { brand: "chatlogi" });
}

/** 管理者通知だけを送る必要がある、ユーザー不明の配送ステータス更新用。 */
export async function notifyShipmentStatusToAdmins(input: {
  shipmentId: number;
  status: string;
  route?: string;
}): Promise<void> {
  await notifyAdmins(`Chat LOGI - ${input.status}`, [
    `案件 #${input.shipmentId} のステータスが「${input.status}」に更新されました。`,
    input.route ? `ルート：${input.route}` : "",
  ].filter(Boolean).join("\n"), { brand: "chatlogi" });
}
