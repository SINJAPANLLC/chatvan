import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanContractsTable } from "./van_contracts";
import { vehiclesTable } from "./vehicles";

export const recoveryCaseStatusEnum = pgEnum("recovery_case_status", [
  "contacting",         // 連絡中
  "return_requested",   // 返却要求済み
  "overdue",            // 期限超過
  "location_check",     // GPS位置確認中
  "recovery_requested", // 回収依頼済み
  "recovered",          // 回収完了
  "closed",             // クローズ
]);

export const RECOVERY_STATUS_LABELS: Record<string, string> = {
  contacting: "連絡中",
  return_requested: "返却要求済み",
  overdue: "期限超過",
  location_check: "GPS確認中",
  recovery_requested: "回収依頼済み",
  recovered: "回収完了",
  closed: "クローズ",
};

export const recoveryCasesTable = pgTable("recovery_cases", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id).notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),

  returnDeadline: text("return_deadline"),
  contactHistory: text("contact_history"),            // JSON配列 [{date, method, result}]
  emergencyContactHistory: text("emergency_contact_history"), // JSON配列

  // GPS情報
  gpsLastLocation: text("gps_last_location"),         // "lat,lng"
  gpsLastSeen: timestamp("gps_last_seen"),
  gpsReportDocument: text("gps_report_document"),     // PDF パス

  // 回収対応
  rentalCompanyContact: text("rental_company_contact"),
  recoveryProvider: text("recovery_provider"),
  recoveryRequestedAt: timestamp("recovery_requested_at"),
  recoveredAt: timestamp("recovered_at"),
  recoveryCost: numeric("recovery_cost", { precision: 10, scale: 2 }),

  status: recoveryCaseStatusEnum("status").notNull().default("contacting"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRecoveryCaseSchema = createInsertSchema(recoveryCasesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRecoveryCase = z.infer<typeof insertRecoveryCaseSchema>;
export type RecoveryCase = typeof recoveryCasesTable.$inferSelect;
