/**
 * 通知ヘルパー — アプリ内通知＋メール送信を一括で行う共通関数
 */
import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendEmail, buildEmailHtml } from "./email";

/** 特定ユーザーにアプリ内通知＋メールを送る */
export async function notifyUser(userId: number, title: string, message: string) {
  await db.insert(notificationsTable).values({ userId, title, message });
  const raw = await db.execute(sql`SELECT email, name FROM users WHERE id = ${userId} LIMIT 1`);
  const u = ((raw as any)?.rows ?? raw)[0];
  if (u?.email) {
    const html = buildEmailHtml({ subject: title, body: message, recipientName: u.name ?? undefined });
    sendEmail(u.email, `【SIN JAPAN】${title}`, html).catch(() => {});
  }
}

/** 管理者全員にアプリ内通知＋メールを送る */
export async function notifyAdmins(title: string, message: string) {
  const raw = await db.execute(sql`SELECT id, email, name FROM users WHERE role = 'admin'`);
  const admins = (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
  for (const admin of admins) {
    await db.insert(notificationsTable).values({ userId: (admin as any).id, title, message });
    const email = (admin as any).email;
    if (email) {
      const html = buildEmailHtml({ subject: title, body: message, recipientName: (admin as any).name ?? undefined });
      sendEmail(email, `【SIN JAPAN】${title}`, html).catch(() => {});
    }
  }
}

/** 協力会社ユーザー全員にアプリ内通知＋メールを送る */
export async function notifyRcUsers(rcId: number, title: string, message: string) {
  const raw = await db.execute(sql`SELECT id, email, name FROM users WHERE rental_company_id = ${rcId}`);
  const users = (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
  for (const u of users) {
    await db.insert(notificationsTable).values({ userId: (u as any).id, title, message });
    const email = (u as any).email;
    if (email) {
      const html = buildEmailHtml({ subject: title, body: message, recipientName: (u as any).name ?? undefined });
      sendEmail(email, `【SIN JAPAN】${title}`, html).catch(() => {});
    }
  }
}
