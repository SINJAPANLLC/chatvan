import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclesTable } from "./vehicles";
import { vanContractsTable } from "./van_contracts";

export const insurancePolicyStatusEnum = pgEnum("insurance_policy_status", [
  "active",
  "expiring_soon",  // 30日以内
  "expired",
  "cancelled",
]);

export const insurancePoliciesTable = pgTable("insurance_policies", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id),
  contractId: integer("contract_id").references(() => vanContractsTable.id),

  insuranceCompany: text("insurance_company").notNull(),
  policyNumber: text("policy_number"),
  startDate: text("start_date"),
  expiryDate: text("expiry_date").notNull(),

  // 補償内容
  bodilyInjury: text("bodily_injury"),       // 対人補償
  propertyDamage: text("property_damage"),   // 対物補償
  vehicleCoverage: text("vehicle_coverage"), // 車両保険
  personalInjury: text("personal_injury"),   // 搭乗者傷害
  deductible: text("deductible"),            // 免責金額

  // 利用条件
  driverConditions: text("driver_conditions"),  // 運転者条件
  ageConditions: text("age_conditions"),        // 年齢条件
  commercialUseAllowed: boolean("commercial_use_allowed").default(false), // 商用利用可否

  policyDocument: text("policy_document"),  // オブジェクトストレージパス
  status: insurancePolicyStatusEnum("status").notNull().default("active"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInsurancePolicySchema = createInsertSchema(insurancePoliciesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInsurancePolicy = z.infer<typeof insertInsurancePolicySchema>;
export type InsurancePolicy = typeof insurancePoliciesTable.$inferSelect;
