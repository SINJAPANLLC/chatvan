import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vanContractsTable } from "./van_contracts";
import { rentalCompaniesTable } from "./rental_companies";

export const settlementStatusEnum = pgEnum("settlement_status", [
  "pending",    // 精算待ち（ユーザー未払い or 処理前）
  "processing", // 処理中
  "completed",  // 精算完了
  "on_hold",    // 保留（ユーザー未払い等）
  "cancelled",  // キャンセル
]);

export const settlementsTable = pgTable("settlements", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id).notNull(),
  rentalCompanyId: integer("rental_company_id").references(() => rentalCompaniesTable.id).notNull(),

  periodMonth: text("period_month").notNull(),          // 対象月 YYYY-MM
  userPaymentAmount: numeric("user_payment_amount", { precision: 10, scale: 2 }),   // ユーザー入金額
  rentalCompanyAmount: numeric("rental_company_amount", { precision: 10, scale: 2 }), // レンタル会社受取額
  chatVanFee: numeric("chat_van_fee", { precision: 10, scale: 2 }),                 // Chat VAN手数料

  scheduledDate: text("scheduled_date"),    // 精算予定日
  completedAt: timestamp("completed_at"),   // 精算完了日時
  transferReference: text("transfer_reference"), // 振込参照番号

  status: settlementStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettlementSchema = createInsertSchema(settlementsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSettlement = z.infer<typeof insertSettlementSchema>;
export type Settlement = typeof settlementsTable.$inferSelect;
