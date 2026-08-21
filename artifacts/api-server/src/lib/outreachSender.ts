import { randomUUID } from "crypto";
import { and, eq, sql as drizzleSql } from "drizzle-orm";
import { db, prospectsTable } from "@workspace/db";
import { buildSalesEmailHtml, sendEmail } from "./email";

type ProspectType = "user" | "rental_company";

export type OutreachRequest = {
  prospectId: number;
  prospectType: ProspectType;
  subject: string;
  bodyText: string;
  ctaText?: string;
  ctaUrl?: string;
};

export type OutreachResult = {
  id: number;
  email?: string;
  sent: boolean;
  reason?: string;
};

/**
 * 宛先を原子的に確保してから送る共通送信処理。
 * sending のまま残る宛先は、SMTP送信後の保存状態が不明なため自動再送しない。
 */
export async function sendProspectOutreach(request: OutreachRequest): Promise<OutreachResult> {
  const attemptKey = randomUUID();
  let prospect: any;
  try {
    prospect = await db.transaction(async (tx) => {
      const claimResult = await tx.execute(drizzleSql`
        UPDATE prospects
        SET status = 'sending'
        WHERE id = ${request.prospectId}
          AND status = 'unsent'
          AND prospect_type = ${request.prospectType}
        RETURNING *
      `);
      const claimed = ((claimResult as any)?.rows ?? claimResult ?? [])[0];
      if (!claimed) return null;

      await tx.execute(drizzleSql`
        INSERT INTO email_send_logs
          (prospect_id, prospect_type, attempt_key, email, company_name, subject, body_text, sent, reason, sent_at)
        VALUES
          (${claimed.id}, ${request.prospectType}, ${attemptKey}, ${claimed.email}, ${claimed.company_name},
           ${request.subject}, ${request.bodyText}, FALSE, '送信処理中', NOW())
      `);
      return claimed;
    });
  } catch (error) {
    console.error("営業メールの宛先確保または試行記録の作成に失敗しました", error);
    return {
      id: request.prospectId,
      sent: false,
      reason: "送信前の処理を完了できなかったため送信していません",
    };
  }
  if (!prospect) {
    return {
      id: request.prospectId,
      sent: false,
      reason: "送信済み、確認待ち、または対象外のためスキップしました",
    };
  }

  const html = buildSalesEmailHtml({
    subject: request.subject,
    bodyText: request.bodyText,
    companyName: prospect.company_name,
    contactName: prospect.contact_name ?? undefined,
    ctaText: request.ctaText,
    ctaUrl: request.ctaUrl,
  });
  const emailResult = await sendEmail(prospect.email, request.subject, html);

  if (!emailResult.sent) {
    try {
      await db.execute(drizzleSql`
        UPDATE email_send_logs
        SET sent = FALSE, reason = ${emailResult.reason ?? "送信に失敗しました"}, sent_at = NOW()
        WHERE attempt_key = ${attemptKey}
      `);
      await db.execute(drizzleSql`
        UPDATE prospects SET status = 'unsent'
        WHERE id = ${prospect.id} AND status = 'sending'
      `);
    } catch (error) {
      console.error("送信失敗メールの保存処理に失敗しました", error);
      return {
        id: prospect.id,
        email: prospect.email,
        sent: false,
        reason: "送信は失敗しましたが、状態の保存確認待ちです",
      };
    }
    return { id: prospect.id, email: prospect.email, ...emailResult };
  }

  try {
    await db.execute(drizzleSql`
      UPDATE email_send_logs
      SET sent = TRUE, reason = NULL, sent_at = NOW()
      WHERE attempt_key = ${attemptKey}
    `);
    await db.update(prospectsTable)
      .set({ status: "sent", sentAt: new Date() })
      .where(and(eq(prospectsTable.id, prospect.id), eq(prospectsTable.status, "sending")));
    return { id: prospect.id, email: prospect.email, sent: true };
  } catch (error) {
    console.error("送信済みメールの保存処理に失敗しました", error);
    return {
      id: prospect.id,
      email: prospect.email,
      sent: true,
      reason: "メールは送信済みですが、送信確認待ちです",
    };
  }
}