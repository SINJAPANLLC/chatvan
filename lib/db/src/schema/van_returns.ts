import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanContractsTable } from "./van_contracts";
import { vehiclesTable } from "./vehicles";

export const returnStatusEnum = pgEnum("return_status", [
  "requested",
  "scheduled",
  "in_progress",
  "inspecting",
  "completed",
  "cancelled",
]);

export const vanReturnsTable = pgTable("van_returns", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id).notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id).notNull(),

  returnDate: text("return_date"),            // 返却希望日
  returnLocation: text("return_location"),    // 返却場所
  reason: text("reason"),                     // 返却理由

  status: returnStatusEnum("status").notNull().default("requested"),
  adminNotes: text("admin_notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanReturnSchema = createInsertSchema(vanReturnsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertVanReturn = z.infer<typeof insertVanReturnSchema>;
export type VanReturn = typeof vanReturnsTable.$inferSelect;
