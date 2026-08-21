import { pgTable, serial, text, integer, numeric, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vehiclesTable } from "./vehicles";
import { vanApplicationsTable } from "./van_applications";
import { rentalCompaniesTable } from "./rental_companies";

export const vanContractStatusEnum = pgEnum("van_contract_status", [
  "draft",
  "pending_documents",
  "pending_signature",
  "pending_payment",
  "payment_processing",
  "active",
  "payment_issue",
  "return_pending",
  "completed",
  "cancelled",
]);

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  pending_documents: "書類待ち",
  pending_signature: "署名待ち",
  pending_payment: "決済待ち",
  payment_processing: "決済処理中",
  active: "利用中",
  payment_issue: "未払い",
  return_pending: "返却予定",
  completed: "契約終了",
  cancelled: "キャンセル",
};

export const vanContractsTable = pgTable("van_contracts", {
  id: serial("id").primaryKey(),
  contractNumber: text("contract_number"),
  applicationId: integer("application_id").references(() => vanApplicationsTable.id),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),
  rentalCompanyId: integer("rental_company_id").references(() => rentalCompaniesTable.id),
  // 契約主体（ハードコードしない）
  platformOperator: text("platform_operator").default("SIN JAPAN株式会社"),
  contractProvider: text("contract_provider"),
  vehicleProvider: text("vehicle_provider"),
  startDate: text("start_date"),
  plannedEndDate: text("planned_end_date"),
  minimumTerm: integer("minimum_term"),
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(),
  sinJapanFee: numeric("sin_japan_fee", { precision: 10, scale: 2 }).default("0"),
  paymentDay: integer("payment_day").default(1),
  status: vanContractStatusEnum("status").notNull().default("draft"),
  // 2本の契約書の同意記録
  platformContractAgreedAt: timestamp("platform_contract_agreed_at"),
  vehicleContractAgreedAt: timestamp("vehicle_contract_agreed_at"),
  termsAgreedAt: timestamp("terms_agreed_at"),
  signatureData: text("signature_data"),
  specialTerms: text("special_terms"),
  terminationTerms: text("termination_terms"),
  returnTerms: text("return_terms"),
  notes: text("notes"),
  // オプション
  blackNumberRequested: boolean("black_number_requested").default(false),
  insuranceReferralRequested: boolean("insurance_referral_requested").default(false),
  gpsConsent: boolean("gps_consent").default(false),
  optionsFee: numeric("options_fee", { precision: 10, scale: 2 }).default("0"),
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
