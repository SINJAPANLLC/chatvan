import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalCompaniesTable } from "./rental_companies";

export const vehicleStatusEnum = pgEnum("vehicle_status_en", [
  "draft",          // 下書き
  "reviewing",      // 確認中
  "available",      // 募集中
  "proposed",       // 提案中
  "reserved",       // 予約済み
  "rented",         // 貸出中
  "return_pending", // 返却予定
  "maintenance",    // 整備中
  "suspended",      // 一時停止
  "unavailable",    // 掲載停止
]);

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  reviewing: "確認中",
  available: "募集中",
  proposed: "提案中",
  reserved: "予約済み",
  rented: "貸出中",
  return_pending: "返却予定",
  maintenance: "整備中",
  suspended: "一時停止",
  unavailable: "掲載停止",
};

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  rentalCompanyId: integer("rental_company_id").references(() => rentalCompaniesTable.id),

  // 基本情報
  maker: text("maker").notNull(),
  model: text("model").notNull(),
  grade: text("grade"),
  year: integer("year"),
  vin: text("vin"),                          // 車台番号
  licensePlate: text("license_plate"),       // ナンバープレート
  blackNumberStatus: text("black_number_status"), // 黒ナンバー状況

  // 状態
  mileage: integer("mileage"),
  inspectionExpiry: text("inspection_expiry"),        // 車検期限
  compulsoryInsuranceExpiry: text("compulsory_insurance_expiry"), // 自賠責期限
  insuranceExpiry: text("insurance_expiry"),           // 任意保険期限

  // 場所
  prefecture: text("prefecture"),
  locationDetail: text("location_detail"),

  // GPS
  gpsDeviceId: text("gps_device_id"),

  // 装備
  smokingPolicy: text("smoking_policy").default("no_smoking"), // no_smoking/smoking/unspecified
  hasEtc: boolean("has_etc").default(false),
  hasDashcam: boolean("has_dashcam").default(false),
  hasBackupCam: boolean("has_backup_cam").default(false),

  // レンタル条件
  availableFrom: text("available_from"),
  minPeriodMonths: integer("min_period_months").default(1),
  maxPeriodMonths: integer("max_period_months"),
  mileageLimit: integer("mileage_limit"),            // 月間走行距離上限(km)
  excessMileageFee: numeric("excess_mileage_fee", { precision: 10, scale: 2 }), // 超過単価(/km)

  // 料金（分離管理）
  rentalCompanyAmount: numeric("rental_company_amount", { precision: 10, scale: 2 }).notNull(), // レンタル会社受取
  chatVanFee: numeric("chat_van_fee", { precision: 10, scale: 2 }).default("0"),               // Chat VAN手数料
  insuranceFee: numeric("insurance_fee", { precision: 10, scale: 2 }).default("0"),            // 保険料
  // userPrice = rentalCompanyAmount + chatVanFee + insuranceFee (computed on read)

  photos: text("photos"),   // JSON配列
  notes: text("notes"),
  status: vehicleStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
