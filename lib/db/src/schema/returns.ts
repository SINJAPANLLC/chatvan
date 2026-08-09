import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanContractsTable } from "./van_contracts";
import { vehiclesTable } from "./vehicles";

export const returnStatusEnum = pgEnum("return_status", [
  "requested",    // 返却申請
  "scheduled",    // 日程確定
  "inspecting",   // 検査中
  "completed",    // 返却完了
  "disputed",     // 異議あり
]);

export const returnsTable = pgTable("returns", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id).notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),

  // 申請内容
  requestedReturnDate: text("requested_return_date"),
  returnLocation: text("return_location"),
  returnReason: text("return_reason"),

  status: returnStatusEnum("status").notNull().default("requested"),
  actualReturnDate: text("actual_return_date"),
  adminNotes: text("admin_notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const returnInspectionsTable = pgTable("return_inspections", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").references(() => returnsTable.id).notNull(),

  // 返却時状態
  mileageAtReturn: integer("mileage_at_return"),
  fuelLevel: text("fuel_level"),
  exteriorPhotos: text("exterior_photos"),   // JSON配列
  interiorPhotos: text("interior_photos"),
  damageNotes: text("damage_notes"),
  cleaningCondition: text("cleaning_condition"),
  hasKey: text("has_key"),
  hasEtcCard: text("has_etc_card"),
  accessories: text("accessories"),          // 付属品確認 JSON

  // 追加請求
  additionalCharges: text("additional_charges"), // JSON配列 [{item, amount, reason}]
  totalAdditionalAmount: numeric("total_additional_amount", { precision: 10, scale: 2 }).default("0"),

  inspectedBy: integer("inspected_by"),      // admin user id
  inspectedAt: timestamp("inspected_at"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReturnSchema = createInsertSchema(returnsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReturnInspectionSchema = createInsertSchema(returnInspectionsTable).omit({ id: true, createdAt: true });

export type InsertReturn = z.infer<typeof insertReturnSchema>;
export type Return = typeof returnsTable.$inferSelect;
export type InsertReturnInspection = z.infer<typeof insertReturnInspectionSchema>;
export type ReturnInspection = typeof returnInspectionsTable.$inferSelect;
