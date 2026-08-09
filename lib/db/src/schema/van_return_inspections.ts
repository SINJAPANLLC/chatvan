import { pgTable, serial, text, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vanReturnsTable } from "./van_returns";

export const vanReturnInspectionsTable = pgTable("van_return_inspections", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").references(() => vanReturnsTable.id).notNull(),

  // 車両状態チェック
  exteriorOk: boolean("exterior_ok"),
  interiorOk: boolean("interior_ok"),
  scratchNotes: text("scratch_notes"),        // 傷の詳細
  mileageAtReturn: integer("mileage_at_return"),
  fuelLevel: text("fuel_level"),              // full/3quarter/half/quarter/empty
  keyReturned: boolean("key_returned"),
  etcCardReturned: boolean("etc_card_returned"),
  accessoriesOk: boolean("accessories_ok"),
  cleaningStatus: text("cleaning_status"),    // clean/needs_cleaning/dirty
  photos: text("photos"),                     // JSON配列

  // 追加精算
  etcCharge: numeric("etc_charge", { precision: 10, scale: 2 }).default("0"),
  fuelCharge: numeric("fuel_charge", { precision: 10, scale: 2 }).default("0"),
  lateReturnCharge: numeric("late_return_charge", { precision: 10, scale: 2 }).default("0"),
  excessMileageCharge: numeric("excess_mileage_charge", { precision: 10, scale: 2 }).default("0"),
  cleaningCharge: numeric("cleaning_charge", { precision: 10, scale: 2 }).default("0"),
  damageCharge: numeric("damage_charge", { precision: 10, scale: 2 }).default("0"),
  keyLossCharge: numeric("key_loss_charge", { precision: 10, scale: 2 }).default("0"),
  recoveryCharge: numeric("recovery_charge", { precision: 10, scale: 2 }).default("0"),
  otherCharge: numeric("other_charge", { precision: 10, scale: 2 }).default("0"),
  otherChargeNote: text("other_charge_note"),

  inspectedBy: text("inspected_by"),
  inspectedAt: timestamp("inspected_at"),
  adminNotes: text("admin_notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanReturnInspectionSchema = createInsertSchema(vanReturnInspectionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertVanReturnInspection = z.infer<typeof insertVanReturnInspectionSchema>;
export type VanReturnInspection = typeof vanReturnInspectionsTable.$inferSelect;
