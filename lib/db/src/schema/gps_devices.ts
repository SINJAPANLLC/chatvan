import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclesTable } from "./vehicles";

export const gpsDeviceStatusEnum = pgEnum("gps_device_status", [
  "active",
  "inactive",
  "lost_signal",
  "removed",
]);

export const gpsDevicesTable = pgTable("gps_devices", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),
  provider: text("provider"),                   // GPS事業者名
  deviceIdentifier: text("device_identifier").notNull(), // デバイスID
  status: gpsDeviceStatusEnum("status").notNull().default("active"),
  installedAt: timestamp("installed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gpsLocationsTable = pgTable("gps_locations", {
  id: serial("id").primaryKey(),
  gpsDeviceId: integer("gps_device_id").references(() => gpsDevicesTable.id).notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  address: text("address"),                     // 逆ジオコーディング結果
  ignitionStatus: text("ignition_status"),      // on/off
  mileage: integer("mileage"),
  battery: text("battery"),
  speed: integer("speed"),                      // km/h
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertGpsDeviceSchema = createInsertSchema(gpsDevicesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertGpsLocationSchema = createInsertSchema(gpsLocationsTable).omit({ id: true });

export type InsertGpsDevice = z.infer<typeof insertGpsDeviceSchema>;
export type GpsDevice = typeof gpsDevicesTable.$inferSelect;
export type InsertGpsLocation = z.infer<typeof insertGpsLocationSchema>;
export type GpsLocation = typeof gpsLocationsTable.$inferSelect;
