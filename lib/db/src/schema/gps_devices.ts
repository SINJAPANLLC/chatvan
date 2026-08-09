import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclesTable } from "./vehicles";

export const gpsDevicesTable = pgTable("gps_devices", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull().unique(), // 端末ID
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id),

  isConnected: boolean("is_connected").default(false),
  lastCommunicatedAt: timestamp("last_communicated_at"),
  provider: text("provider"),                // GPS事業者名（将来切替可能）
  providerDeviceId: text("provider_device_id"), // 事業者側端末ID

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGpsDeviceSchema = createInsertSchema(gpsDevicesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertGpsDevice = z.infer<typeof insertGpsDeviceSchema>;
export type GpsDevice = typeof gpsDevicesTable.$inferSelect;
