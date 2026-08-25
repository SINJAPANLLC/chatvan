import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shipmentsTable } from "./shipments";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id")
    .references(() => shipmentsTable.id),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  readStatus: boolean("read_status").notNull().default(false),
  emailStatus: text("email_status").notNull().default("not_requested"),
  emailError: text("email_error"),
  emailSentAt: timestamp("email_sent_at"),
  emailAttemptCount: integer("email_attempt_count").notNull().default(0),
  emailAttemptStartedAt: timestamp("email_attempt_started_at"),
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(
  notificationsTable
).omit({ id: true, createdAt: true });

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
