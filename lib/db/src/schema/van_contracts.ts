import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vehiclesTable } from "./vehicles";
import { vanApplicationsTable } from "./van_applications";
import { rentalCompaniesTable } from "./rental_companies";

export const vanContractStatusEnum = pgEnum("van_contract_status", [
  "contracting",
  "pending_delivery",
  "active",
  "return_pending",
  "completed",
  "cancelled",
]);

export const VAN_CONTRACT_STATUS_LABELS: Record<string, string> = {
  contracting:      "契約手続き中",
  pending_delivery: "車両受取待ち",
  active:           "利用中",
  return_pending:   "返却予定",
  completed:        "契約終了",
  cancelled:        "解約",
};

export const vanContractsTable = pgTable("van_contracts", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").references(() => vanApplicationsTable.id),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),
  rentalCompanyId: integer("rental_company_id").references(() => rentalCompaniesTable.id),

  // 契約期間
  startDate: text("start_date"),
  endDate: text("end_date"),
  minPeriodMonths: integer("min_period_months").default(1),

  // 料金
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(),
  rentalCompanyAmount: numeric("rental_company_amount", { precision: 10, scale: 2 }),
  chatVanFee: numeric("chat_van_fee", { precision: 10, scale: 2 }),
  paymentDay: integer("payment_day").default(1),     // 毎月支払日
  nextPaymentDate: text("next_payment_date"),

  // 契約主体（将来対応）
  contractProvider: text("contract_provider").default("SIN JAPAN"),
  vehicleProvider: text("vehicle_provider"),
  platformOperator: text("platform_operator").default("SIN JAPAN"),

  // 同意・署名
  termsAgreedAt: timestamp("terms_agreed_at"),
  signatureData: text("signature_data"),

  status: vanContractStatusEnum("status").notNull().default("contracting"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanContractSchema = createInsertSchema(vanContractsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertVanContract = z.infer<typeof insertVanContractSchema>;
export type VanContract = typeof vanContractsTable.$inferSelect;
