import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanContractsTable } from "./van_contracts";

export const vanPaymentStatusEnum = pgEnum("van_payment_status", [
  "pending",
  "authorized",
  "paid",
  "failed",
  "retrying",
  "overdue",
  "refunded",
  "partially_refunded",
  "cancelled",
]);

export const VAN_PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending:            "決済待ち",
  authorized:         "オーソリ済",
  paid:               "決済完了",
  failed:             "決済失敗",
  retrying:           "再決済中",
  overdue:            "期限超過",
  refunded:           "返金済",
  partially_refunded: "一部返金",
  cancelled:          "キャンセル",
};

export const vanPaymentsTable = pgTable("van_payments", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id).notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),

  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("jpy"),
  paymentType: text("payment_type").notNull(), // initial / monthly / additional / refund
  billingPeriod: text("billing_period"),        // YYYY-MM

  status: vanPaymentStatusEnum("status").notNull().default("pending"),

  // 決済プロバイダ（カード情報は保存しない）
  paymentProvider: text("payment_provider"),    // stripe / square 等
  paymentMethodToken: text("payment_method_token"), // プロバイダトークンのみ
  providerPaymentId: text("provider_payment_id"),
  providerStatus: text("provider_status"),

  paidAt: timestamp("paid_at"),
  dueDate: text("due_date"),                    // 支払期限
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanPaymentSchema = createInsertSchema(vanPaymentsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertVanPayment = z.infer<typeof insertVanPaymentSchema>;
export type VanPayment = typeof vanPaymentsTable.$inferSelect;
