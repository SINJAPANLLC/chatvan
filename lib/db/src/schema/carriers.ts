import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const carriersTable = pgTable("carriers", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  fax: text("fax"),
  email: text("email"),
  serviceAreas: text("service_areas"),
  vehicleTypes: text("vehicle_types"),
  bankAccount: text("bank_account"),
  paymentTerms: text("payment_terms"),
  specialties: text("specialties"),
  averageCost: numeric("average_cost", { precision: 12, scale: 2 }),
  onTimeRate: numeric("on_time_rate", { precision: 5, scale: 2 }),
  rating: numeric("rating", { precision: 3, scale: 1 }),
  totalOrders: integer("total_orders").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCarrierSchema = createInsertSchema(carriersTable).omit({
  id: true,
  createdAt: true,
  totalOrders: true,
});

export type InsertCarrier = z.infer<typeof insertCarrierSchema>;
export type Carrier = typeof carriersTable.$inferSelect;
