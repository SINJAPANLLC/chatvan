import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const identityVerificationStatusEnum = pgEnum("identity_verification_status", [
  "not_started",
  "submitted",
  "verified",
  "rejected",
  "expired",
]);

export const IDENTITY_STATUS_LABELS: Record<string, string> = {
  not_started: "未提出",
  submitted: "確認待ち",
  verified: "確認済み",
  rejected: "否認",
  expired: "期限切れ",
};

export const identityVerificationsTable = pgTable("identity_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  applicationId: integer("application_id"),

  // 本人情報
  fullName: text("full_name"),
  birthDate: text("birth_date"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),

  // 免許証
  licenseFront: text("license_front"),    // オブジェクトストレージパス
  licenseBack: text("license_back"),
  licenseExpiry: text("license_expiry"),
  licenseType: text("license_type"),       // 普通/中型/大型等
  licenseNumber: text("license_number"),

  // 緊急連絡先
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  emergencyContactRelation: text("emergency_contact_relation"),

  status: identityVerificationStatusEnum("status").notNull().default("not_started"),
  verifiedBy: integer("verified_by"),      // admin user id
  verifiedAt: timestamp("verified_at"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIdentityVerificationSchema = createInsertSchema(identityVerificationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIdentityVerification = z.infer<typeof insertIdentityVerificationSchema>;
export type IdentityVerification = typeof identityVerificationsTable.$inferSelect;
