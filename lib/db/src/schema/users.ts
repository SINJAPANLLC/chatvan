import { pgTable, serial, text, timestamp, boolean, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["user", "admin", "rental_company"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  companyName: text("company_name"),
  phone: text("phone"),
  role: userRoleEnum("role").notNull().default("user"),
  rentalCompanyId: integer("rental_company_id"),
  billingAddress: text("billing_address"),
  cardHolderName: text("card_holder_name"),
  cardBrand: text("card_brand"),
  cardLast4: text("card_last4"),
  cardExpiry: text("card_expiry"),
  // 法人・与信管理
  isCompany: boolean("is_company").default(false),
  corporateNumber: text("corporate_number"),          // 法人番号（13桁）
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }).default("0"),
  creditUsed: numeric("credit_used", { precision: 12, scale: 2 }).default("0"),
  creditStatus: text("credit_status").default("none"), // none/pending/approved/rejected/suspended
  paymentTerms: text("payment_terms").default("Net30"),
  preferredPaymentMethod: text("preferred_payment_method").default("card"), // card/invoice
  squareCustomerId: text("square_customer_id"),
  squareCardId: text("square_card_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
