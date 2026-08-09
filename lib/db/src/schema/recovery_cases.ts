import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanContractsTable } from "./van_contracts";
import { vehiclesTable } from "./vehicles";

export const recoveryCaseStatusEnum = pgEnum("recovery_case_status", [
  "contacting",
  "return_requested",
  "overdue",
  "location_check",
  "recovery_requested",
  "recovered",
  "closed",
]);

export const RECOVERY_CASE_STATUS_LABELS: Record<string, string> = {
  contacting:         "連絡中",
  return_requested:   "返却要求済",
  overdue:            "期限超過",
  location_check:     "GPS確認中",
  recovery_requested: "回収依頼済",
  recovered:          "回収完了",
  closed:             "クローズ",
};

export const recoveryCasesTable = pgTable("recovery_cases", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id).notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),

  caseType: text("case_type").notNull(),       // unpaid / unreturned / disappeared
  status: recoveryCaseStatusEnum("status").notNull().default("contacting"),

  returnDeadline: text("return_deadline"),
  contactHistory: text("contact_history"),     // JSON配列 [{date, method, result}]
  gpsLastLocation: text("gps_last_location"),  // 最終GPS位置
  gpsLastCommunicatedAt: timestamp("gps_last_communicated_at"),

  rentalCompanyNotifiedAt: timestamp("rental_company_notified_at"),
  recoveryRequestedAt: timestamp("recovery_requested_at"),
  recoveredAt: timestamp("recovered_at"),
  recoveryFee: text("recovery_fee"),
  adminNotes: text("admin_notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRecoveryCaseSchema = createInsertSchema(recoveryCasesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertRecoveryCase = z.infer<typeof insertRecoveryCaseSchema>;
export type RecoveryCase = typeof recoveryCasesTable.$inferSelect;
