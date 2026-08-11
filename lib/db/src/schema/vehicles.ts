import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rentalCompaniesTable } from "./rental_companies";

// 既存の enum 名を維持しつつ英語値へ移行（migration.ts で変換）
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
  maker: text("maker").notNull(),
  model: text("model").notNull(),
  grade: text("grade"),
  year: integer("year"),
  vin: text("vin"),
  licensePlate: text("license_plate"),
  blackNumberStatus: text("black_number_status"),
  mileage: integer("mileage"),
  inspectionExpiry: text("inspection_expiry"),
  compulsoryInsuranceExpiry: text("compulsory_insurance_expiry"),
  insuranceExpiry: text("insurance_expiry"),
  prefecture: text("prefecture"),
  locationDetail: text("location_detail"),
  gpsDeviceId: text("gps_device_id"),
  smokingPolicy: text("smoking_policy").default("no_smoking"),
  hasEtc: boolean("has_etc").default(false),
  hasDashcam: boolean("has_dashcam").default(false),
  hasBackupCam: boolean("has_backup_cam").default(false),
  availableFrom: text("available_from"),
  minPeriodMonths: integer("min_period_months").default(1),
  maxPeriodMonths: integer("max_period_months"),
  mileageLimit: integer("mileage_limit"),
  excessMileageFee: numeric("excess_mileage_fee", { precision: 10, scale: 2 }),
  // 料金は3分割（既存カラム名を維持）
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(),   // レンタル会社受取
  sinJapanFee: numeric("sin_japan_fee", { precision: 10, scale: 2 }).default("0"), // Chat VAN手数料
  insuranceFee: numeric("insurance_fee", { precision: 10, scale: 2 }).default("0"),
  shakenCertPath: text("shaken_cert_path"),
  kensakushoCertPath: text("kensakusho_cert_path"),
  jibaisekiCertPath: text("jibaiseki_cert_path"),
  ninniHokenCertPath: text("ninni_hoken_cert_path"),
  color: text("color"),
  engineDisplacement: text("engine_displacement"),
  fuelType: text("fuel_type"),
  transmission: text("transmission"),
  photos: text("photos"),
  notes: text("notes"),
  status: vehicleStatusEnum("status").notNull().default("draft"),
  // 車検・任意保険情報
  inspectionCertificateOwner: text("inspection_certificate_owner"),
  inspectionCertificateUser: text("inspection_certificate_user"),
  insuranceCompany: text("insurance_company"),
  insurancePolicyNumber: text("insurance_policy_number"),
  insuranceContact: text("insurance_contact"),
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
