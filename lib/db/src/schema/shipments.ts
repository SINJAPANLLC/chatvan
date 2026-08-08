import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { carriersTable } from "./carriers";

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "受付中",
  "ヒアリング中",
  "見積提示",
  "顧客承認",
  "手配中",
  "配車確定",
  "集荷完了",
  "配送中",
  "納品完了",
  "請求完了",
  "キャンセル",
  "キャンセル申請中",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "未決済",
  "決済処理中",
  "決済完了",
  "請求書発行済み",
  "入金確認済み",
  "返金済み",
]);

export const shipmentsTable = pgTable("shipments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  requestText: text("request_text"),
  pickupAddress: text("pickup_address"),
  deliveryAddress: text("delivery_address"),
  cargoType: text("cargo_type"),
  cargoQuantity: text("cargo_quantity"),
  cargoWeight: text("cargo_weight"),
  cargoSize: text("cargo_size"),
  pickupDatetime: text("pickup_datetime"),
  deliveryDeadline: text("delivery_deadline"),
  vehicleType: text("vehicle_type"),         // 表示用 (例: "4tウイング")
  vehicleSize: text("vehicle_size"),          // 軽貨物/1t/2t/4t/10t/大型
  vehicleBodyType: text("vehicle_body_type"), // 平ボディ/ウイング/バン/冷凍冷蔵/幌
  truckCount: integer("truck_count"),
  deliveryType: text("delivery_type"),        // スポット/定期
  deliveryMethod: text("delivery_method"),
  additionalWork: text("additional_work"),
  highwayUse: text("highway_use"),
  customerPrice: numeric("customer_price", { precision: 12, scale: 2 }),
  carrierCost: numeric("carrier_cost", { precision: 12, scale: 2 }),
  grossProfit: numeric("gross_profit", { precision: 12, scale: 2 }),
  status: shipmentStatusEnum("status").notNull().default("受付中"),
  assignedCarrierId: integer("assigned_carrier_id").references(
    () => carriersTable.id
  ),
  assignedDriverName: text("assigned_driver_name"),
  driverToken: text("driver_token").unique(),
  driverCarrierName: text("driver_carrier_name"),
  driverPhone: text("driver_phone"),
  driverVehicleNumber: text("driver_vehicle_number"),
  driverLat: numeric("driver_lat"),
  driverLng: numeric("driver_lng"),
  driverLocationUpdatedAt: timestamp("driver_location_updated_at"),
  paymentStatus: paymentStatusEnum("payment_status"),
  squarePaymentId: text("square_payment_id"),
  squareCaptured: text("square_captured").default("false"),
  paymentMethod: text("payment_method").default("card"), // card/invoice
  cancelPreviousStatus: text("cancel_previous_status"),
  desiredPrice: numeric("desired_price", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipmentsTable.$inferSelect;
