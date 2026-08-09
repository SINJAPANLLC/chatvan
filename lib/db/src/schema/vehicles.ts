import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalCompaniesTable } from "./rental_companies";

export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "draft",
  "reviewing",
  "available",
  "proposed",
  "reserved",
  "rented",
  "return_pending",
  "maintenance",
  "suspended",
  "unavailable",
]);

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  draft:          "下書き",
  reviewing:      "審査中",
  available:      "募集中",
  proposed:       "提案中",
  reserved:       "予約済",
  rented:         "貸出中",
  return_pending: "返却予定",
  maintenance:    "整備中",
  suspended:      "掲載停止",
  unavailable:    "貸出不可",
};

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  rentalCompanyId: integer("rental_company_id").references(() => rentalCompaniesTable.id),

  // 基本情報
  maker: text("maker").notNull(),
  model: text("model").notNull(),
  grade: text("grade"),                          // グレード
  year: integer("year"),
  vin: text("vin"),                              // 車体番号
  licensePlate: text("license_plate"),           // ナンバープレート
  blackNumberStatus: text("black_number_status"), // none/pending/acquired
  mileage: integer("mileage"),                   // 走行距離(km)
  smokingPolicy: text("smoking_policy"),         // nonsmoking/smoking

  // 所在・車検
  prefecture: text("prefecture"),
  locationDetail: text("location_detail"),
  inspectionExpiry: text("inspection_expiry"),   // 車検期限 YYYY-MM
  compulsoryInsuranceExpiry: text("compulsory_insurance_expiry"), // 自賠責期限
  insuranceExpiry: text("insurance_expiry"),     // 任意保険有効期限

  // GPS
  gpsDeviceId: text("gps_device_id"),

  // 装備
  hasEtc: boolean("has_etc").default(false),
  hasDashcam: boolean("has_dashcam").default(false),
  hasBackupCam: boolean("has_backup_cam").default(false),

  // 料金
  rentalCompanyAmount: numeric("rental_company_amount", { precision: 10, scale: 2 }), // レンタル会社希望受取額
  chatVanFee: numeric("chat_van_fee", { precision: 10, scale: 2 }).default("0"),      // Chat VAN手数料
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(),      // ユーザー提示月額
  insuranceFee: numeric("insurance_fee", { precision: 10, scale: 2 }).default("0"),   // 保険関連費用

  // 貸出条件
  availableFrom: text("available_from"),
  minPeriodMonths: integer("min_period_months").default(1),
  maxPeriodMonths: integer("max_period_months"),
  mileageLimit: integer("mileage_limit"),        // 月間走行上限(km) null=無制限
  excessMileageFee: integer("excess_mileage_fee"), // 超過1kmあたり円

  // メディア・備考
  photos: text("photos"),                        // JSON配列
  notes: text("notes"),

  status: vehicleStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
