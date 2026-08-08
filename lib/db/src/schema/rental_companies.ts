import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalCompaniesTable = pgTable("rental_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  serviceArea: text("service_area"), // 対応エリア（都道府県等）
  paymentInfo: text("payment_info"), // 支払先情報
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRentalCompanySchema = createInsertSchema(rentalCompaniesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRentalCompany = z.infer<typeof insertRentalCompanySchema>;
export type RentalCompany = typeof rentalCompaniesTable.$inferSelect;
