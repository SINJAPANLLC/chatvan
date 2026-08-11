import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rentalCompanyStatusEnum = pgEnum("rental_company_status", [
  "prospect",
  "reviewing",
  "active",
  "suspended",
  "terminated",
]);

export const RENTAL_COMPANY_STATUS_LABELS: Record<string, string> = {
  prospect: "候補",
  reviewing: "審査中",
  active: "契約中",
  suspended: "一時停止",
  terminated: "契約終了",
};

export const rentalCompaniesTable = pgTable("rental_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  corporateName: text("corporate_name"),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  serviceAreas: text("service_areas"),
  paymentTerms: text("payment_terms"),
  bankInformation: text("bank_information"),
  businessHours: text("business_hours"),
  emergencyContact: text("emergency_contact"),
  accidentContact: text("accident_contact"),
  breakdownContact: text("breakdown_contact"),
  recoveryContact: text("recovery_contact"),
  insuranceConditions: text("insurance_conditions"),
  contractStartDate: text("contract_start_date"),
  fleetSize: integer("fleet_size"),
  status: rentalCompanyStatusEnum("status").notNull().default("prospect"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRentalCompanySchema = createInsertSchema(rentalCompaniesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRentalCompany = z.infer<typeof insertRentalCompanySchema>;
export type RentalCompany = typeof rentalCompaniesTable.$inferSelect;
