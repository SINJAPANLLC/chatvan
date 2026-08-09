import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalCompanyStatusEnum = pgEnum("rental_company_status", [
  "prospect",
  "reviewing",
  "active",
  "suspended",
  "terminated",
]);

export const rentalCompaniesTable = pgTable("rental_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),               // 会社名（通称）
  legalName: text("legal_name"),              // 法人名
  contactName: text("contact_name"),          // 担当者名
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  serviceArea: text("service_area"),          // 対応エリア
  contractStatus: text("contract_status"),    // 取引状態詳細

  // 精算・銀行
  settlementTerms: text("settlement_terms"),  // 希望精算条件
  bankInfo: text("bank_info"),                // 銀行情報（暗号化推奨）

  // 営業時間・連絡先
  businessHours: text("business_hours"),
  emergencyContact: text("emergency_contact"),
  accidentContact: text("accident_contact"),  // 事故時連絡先
  breakdownContact: text("breakdown_contact"),// 故障時連絡先
  recoveryContact: text("recovery_contact"),  // 回収時連絡先

  // 保険・備考
  insuranceTerms: text("insurance_terms"),    // 保険条件
  notes: text("notes"),
  startedAt: text("started_at"),              // 取引開始日

  status: rentalCompanyStatusEnum("status").notNull().default("prospect"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRentalCompanySchema = createInsertSchema(rentalCompaniesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertRentalCompany = z.infer<typeof insertRentalCompanySchema>;
export type RentalCompany = typeof rentalCompaniesTable.$inferSelect;
