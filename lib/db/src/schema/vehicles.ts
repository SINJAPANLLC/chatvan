import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalCompaniesTable } from "./rental_companies";

export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "募集中",
  "商談中",
  "契約予定",
  "貸出中",
  "返却予定",
  "整備中",
  "掲載停止",
]);

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  rentalCompanyId: integer("rental_company_id").references(() => rentalCompaniesTable.id),
  maker: text("maker").notNull(),        // メーカー（スズキ/ダイハツ/ホンダ等）
  model: text("model").notNull(),        // 車種（エブリイ/ハイゼット等）
  year: integer("year"),                 // 年式
  mileage: integer("mileage"),           // 走行距離(km)
  inspectionExpiry: text("inspection_expiry"), // 車検期限 (YYYY-MM)
  prefecture: text("prefecture"),        // 所在都道府県
  locationDetail: text("location_detail"), // 詳細所在地
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(), // 月額（レンタル会社受取）
  sinJapanFee: numeric("sin_japan_fee", { precision: 10, scale: 2 }).default("0"), // SIN JAPAN手数料
  insuranceFee: numeric("insurance_fee", { precision: 10, scale: 2 }).default("0"), // 保険料
  minPeriodMonths: integer("min_period_months").default(1), // 最低利用期間(月)
  availableFrom: text("available_from"), // 利用可能日
  hasEtc: boolean("has_etc").default(false),
  hasDashcam: boolean("has_dashcam").default(false),
  hasBackupCam: boolean("has_backup_cam").default(false),
  photos: text("photos"),                // JSON配列: ["url1","url2"]
  notes: text("notes"),
  status: vehicleStatusEnum("status").notNull().default("募集中"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
