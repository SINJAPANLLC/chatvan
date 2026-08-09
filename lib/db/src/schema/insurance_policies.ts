import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclesTable } from "./vehicles";
import { vanContractsTable } from "./van_contracts";

export const insurancePolicyStatusEnum = pgEnum("insurance_policy_status", [
  "active",
  "expiring_soon",
  "expired",
  "cancelled",
]);

export const insurancePoliciesTable = pgTable("insurance_policies", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id),
  contractId: integer("contract_id").references(() => vanContractsTable.id),

  insurer: text("insurer"),                  // 保険会社
  policyNumber: text("policy_number"),       // 証券番号
  startDate: text("start_date"),
  expiryDate: text("expiry_date"),

  // 補償内容
  liabilityPerson: text("liability_person"),  // 対人
  liabilityProperty: text("liability_property"), // 対物
  vehicleCoverage: text("vehicle_coverage"),  // 車両保険
  personalAccident: text("personal_accident"), // 人身傷害
  deductible: text("deductible"),             // 免責金額
  driverRestriction: text("driver_restriction"), // 運転者条件
  ageRestriction: text("age_restriction"),    // 年齢条件
  commercialUseAllowed: boolean("commercial_use_allowed").default(true), // 事業用途可否

  // ドキュメント
  policyFilePath: text("policy_file_path"),  // 証券PDF objectPath

  status: insurancePolicyStatusEnum("status").notNull().default("active"),
  adminNotes: text("admin_notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInsurancePolicySchema = createInsertSchema(insurancePoliciesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertInsurancePolicy = z.infer<typeof insertInsurancePolicySchema>;
export type InsurancePolicy = typeof insurancePoliciesTable.$inferSelect;
