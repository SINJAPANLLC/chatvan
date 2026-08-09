import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalCompanyStatusEnum = pgEnum("rental_company_status", [
  "prospect",    // 候補
  "reviewing",   // 審査中
  "active",      // 契約中
  "suspended",   // 一時停止
  "terminated",  // 契約終了
]);

export const RENTAL_COMPANY_STATUS_LABELS: Record<string, string> = {
  prospect: "候補",
  reviewing: "審査中",
  active: "契約中",
  suspended: "一時停止",
  terminated: "契約終了",
};

export const rentalCompaniesTable = pgTable("rental_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                    // 通称・屋号
  corporateName: text("corporate_name"),           // 法人名
  contactName: text("contact_name"),               // 担当者名
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  serviceAreas: text("service_areas"),             // 対応エリア（JSON or カンマ区切り）
  paymentTerms: text("payment_terms"),             // 支払条件
  bankInformation: text("bank_information"),       // 振込先情報
  businessHours: text("business_hours"),
  emergencyContact: text("emergency_contact"),     // 緊急連絡先
  accidentContact: text("accident_contact"),       // 事故時連絡先
  breakdownContact: text("breakdown_contact"),     // 故障時連絡先
  recoveryContact: text("recovery_contact"),       // 回収時連絡先
  insuranceConditions: text("insurance_conditions"), // 保険条件メモ
  contractStartDate: text("contract_start_date"),  // 提携開始日
  status: rentalCompanyStatusEnum("status").notNull().default("prospect"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRentalCompanySchema = createInsertSchema(rentalCompaniesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRentalCompany = z.infer<typeof insertRentalCompanySchema>;
export type RentalCompany = typeof rentalCompaniesTable.$inferSelect;
