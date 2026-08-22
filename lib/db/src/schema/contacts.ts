import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const contactsTable = pgTable("contacts", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  email:       text("email").notNull(),
  subject:     text("subject").notNull(),
  message:     text("message").notNull(),
  replied:     boolean("replied").notNull().default(false),
  replyBody:   text("reply_body"),
  repliedAt:   timestamp("replied_at"),
  repliedBy:   integer("replied_by"),
  replyEmailStatus: text("reply_email_status").notNull().default("not_sent"),
  replyEmailError: text("reply_email_error"),
  replyEmailSentAt: timestamp("reply_email_sent_at"),
  adminNotifyStatus: text("admin_notify_status").notNull().default("not_requested"),
  adminNotifyError: text("admin_notify_error"),
  adminNotifiedAt: timestamp("admin_notified_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type Contact = typeof contactsTable.$inferSelect;
