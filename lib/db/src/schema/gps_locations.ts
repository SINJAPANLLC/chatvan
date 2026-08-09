import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gpsDevicesTable } from "./gps_devices";
import { vehiclesTable } from "./vehicles";

export const gpsLocationsTable = pgTable("gps_locations", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").references(() => gpsDevicesTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id),

  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  altitude: numeric("altitude", { precision: 8, scale: 2 }),
  speed: numeric("speed", { precision: 6, scale: 2 }),   // km/h
  heading: numeric("heading", { precision: 5, scale: 2 }),// 方位角
  mileage: integer("mileage"),                            // 累計走行距離km
  ignition: boolean("ignition"),                          // IGN状態
  batteryLevel: integer("battery_level"),                 // バッテリー%

  recordedAt: timestamp("recorded_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGpsLocationSchema = createInsertSchema(gpsLocationsTable).omit({
  id: true, createdAt: true,
});

export type InsertGpsLocation = z.infer<typeof insertGpsLocationSchema>;
export type GpsLocation = typeof gpsLocationsTable.$inferSelect;
