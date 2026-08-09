import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vanPaymentsTable } from "./van_payments";

export const vanPaymentRetriesTable = pgTable("van_payment_retries", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").references(() => vanPaymentsTable.id).notNull(),

  attemptNumber: integer("attempt_number").notNull(),
  status: text("status").notNull(),          // success / failed
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  providerRetryId: text("provider_retry_id"),

  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
});

export const insertVanPaymentRetrySchema = createInsertSchema(vanPaymentRetriesTable).omit({
  id: true, attemptedAt: true,
});

export type InsertVanPaymentRetry = z.infer<typeof insertVanPaymentRetrySchema>;
export type VanPaymentRetry = typeof vanPaymentRetriesTable.$inferSelect;
