import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanApplicationsTable } from "./van_applications";

export const kycStatusEnum = pgEnum("kyc_status", [
  "not_started",
  "submitted",
  "verified",
  "rejected",
  "expired",
]);

export const identityVerificationsTable = pgTable("identity_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  applicationId: integer("application_id").references(() => vanApplicationsTable.id),

  // 本人情報
  fullName: text("full_name"),
  dob: text("dob"),                          // 生年月日
  address: text("address"),
  phone: text("phone"),
  email: text("email"),

  // 免許証
  licenseFrontPath: text("license_front_path"),   // objectPath
  licenseBackPath: text("license_back_path"),
  licenseExpiry: text("license_expiry"),
  licenseType: text("license_type"),         // 普通/準中型等

  // 緊急連絡先
  emergencyName: text("emergency_name"),
  emergencyPhone: text("emergency_phone"),
  emergencyRelation: text("emergency_relation"),

  // 勤務・稼働情報
  occupation: text("occupation"),
  deliveryHistory: text("delivery_history"),
  usagePurpose: text("usage_purpose"),

  // 審査
  status: kycStatusEnum("status").notNull().default("not_started"),
  adminNotes: text("admin_notes"),
  verifiedAt: timestamp("verified_at"),
  rejectedReason: text("rejected_reason"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIdentityVerificationSchema = createInsertSchema(identityVerificationsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertIdentityVerification = z.infer<typeof insertIdentityVerificationSchema>;
export type IdentityVerification = typeof identityVerificationsTable.$inferSelect;
