/**
 * 案件ステータス変更時の自動通知ヘルパー
 */
import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail, buildEmailHtml, ADMIN_NOTIFY_EMAIL } from "./email";

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

  // ユーザー情報取得
  const [user] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return;

  const subject = rule.subject;
  const body = rule.body(route);

  // DB通知レコード保存
  await db.insert(notificationsTable).values({
    userId,
    shipmentId,
    title: subject,
    message: body,
    readStatus: false,
  });

  // メール送信（非同期、失敗してもOK）
  const html = buildEmailHtml({
    subject,
    body,
    recipientName: user.name ?? undefined,
    statusBadge: status,
    shipmentId,
    ctaText: rule.cta,
  });
  sendEmail(user.email, subject, html, { bcc: ADMIN_NOTIFY_EMAIL }).catch((e) =>
    console.error("[AUTO NOTIFY EMAIL ERROR]", e)
  );
}
