import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vehiclesTable } from "./vehicles";
import { vanApplicationsTable } from "./van_applications";

export const vanContractStatusEnum = pgEnum("van_contract_status", [
  "契約手続き中",
  "利用開始待ち",
  "利用中",
  "返却予定",
  "契約終了",
  "解約",
]);

export const vanContractsTable = pgTable("van_contracts", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").references(() => vanApplicationsTable.id),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),
  startDate: text("start_date"),             // 利用開始日
  endDate: text("end_date"),                 // 終了予定日（null=未定）
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(), // ユーザー支払い額
  sinJapanFee: numeric("sin_japan_fee", { precision: 10, scale: 2 }).default("0"),
  paymentDay: integer("payment_day").default(1), // 毎月の支払い日
  status: vanContractStatusEnum("status").notNull().default("契約手続き中"),
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
