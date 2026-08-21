import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const emailSendLogsTable = pgTable("email_send_logs", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id"),
  prospectType: text("prospect_type").notNull().default("user"),
  attemptKey: text("attempt_key"),
  email: text("email").notNull(),
  companyName: text("company_name"),
  subject: text("subject").notNull(),
  bodyText: text("body_text"),
  sent: boolean("sent").notNull().default(false),
  reason: text("reason"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export type EmailSendLog = typeof emailSendLogsTable.$inferSelect;