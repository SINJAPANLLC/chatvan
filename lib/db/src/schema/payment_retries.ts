import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vanContractsTable } from "./van_contracts";
import { usersTable } from "./users";

export const paymentRetriesTable = pgTable("payment_retries", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id).notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),

  periodMonth: text("period_month").notNull(),    // 対象月 YYYY-MM
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),

  attemptNumber: integer("attempt_number").notNull().default(1),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  result: text("result"),                          // success / failed / cancelled
  failureReason: text("failure_reason"),
  squarePaymentId: text("square_payment_id"),

  nextRetryAt: timestamp("next_retry_at"),
  notificationSentAt: timestamp("notification_sent_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentRetrySchema = createInsertSchema(paymentRetriesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPaymentRetry = z.infer<typeof insertPaymentRetrySchema>;
export type PaymentRetry = typeof paymentRetriesTable.$inferSelect;
