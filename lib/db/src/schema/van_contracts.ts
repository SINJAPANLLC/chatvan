import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vehiclesTable } from "./vehicles";
import { vanApplicationsTable } from "./van_applications";
import { rentalCompaniesTable } from "./rental_companies";

export const vanContractStatusEnum = pgEnum("van_contract_status_en", [
  "draft",              // 下書き
  "pending_documents",  // 書類待ち
  "pending_signature",  // 署名待ち
  "pending_payment",    // 決済待ち
  "active",             // 利用中
  "payment_issue",      // 未払い問題
  "return_pending",     // 返却予定
  "completed",          // 契約終了
  "cancelled",          // キャンセル
]);

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  pending_documents: "書類待ち",
  pending_signature: "署名待ち",
  pending_payment: "決済待ち",
  active: "利用中",
  payment_issue: "未払い",
  return_pending: "返却予定",
  completed: "契約終了",
  cancelled: "キャンセル",
};

export const vanContractsTable = pgTable("van_contracts", {
  id: serial("id").primaryKey(),
  contractNumber: text("contract_number"),             // 契約番号（例: CVN-2024-0001）
  applicationId: integer("application_id").references(() => vanApplicationsTable.id),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),
  rentalCompanyId: integer("rental_company_id").references(() => rentalCompaniesTable.id),

  // 契約主体（ハードコードしない）
  platformOperator: text("platform_operator").default("SIN JAPAN株式会社"),
  contractProvider: text("contract_provider"),   // 契約名義（SIN JAPAN or レンタル会社）
  vehicleProvider: text("vehicle_provider"),     // 車両提供者（レンタル会社名）

  // 期間
  startDate: text("start_date"),
  plannedEndDate: text("planned_end_date"),
  minimumTerm: integer("minimum_term"),           // 最低利用月数

  // 料金
  monthlyAmount: numeric("monthly_amount", { precision: 10, scale: 2 }).notNull(), // ユーザー支払額
  rentalCompanyAmount: numeric("rental_company_amount", { precision: 10, scale: 2 }), // レンタル会社受取
  chatVanFee: numeric("chat_van_fee", { precision: 10, scale: 2 }),
  paymentDay: integer("payment_day").default(1),

  status: vanContractStatusEnum("status").notNull().default("draft"),

  // 同意情報（証跡）
  termsAgreedAt: timestamp("terms_agreed_at"),
  signatureData: text("signature_data"),          // 同意時のIP/UA等 JSON
  platformContractAgreedAt: timestamp("platform_contract_agreed_at"),
  vehicleContractAgreedAt: timestamp("vehicle_contract_agreed_at"),

  // 特記事項
  specialTerms: text("special_terms"),
  terminationTerms: text("termination_terms"),
  returnTerms: text("return_terms"),

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanContractSchema = createInsertSchema(vanContractsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVanContract = z.infer<typeof insertVanContractSchema>;
export type VanContract = typeof vanContractsTable.$inferSelect;
