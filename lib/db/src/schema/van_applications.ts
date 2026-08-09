import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// 既存の enum 名を維持（migration で値を英語へ変換）
export const vanApplicationStatusEnum = pgEnum("van_application_status", [
  "new",
  "hearing",
  "vehicle_search",
  "proposal_ready",
  "proposed",
  "application_received",
  "screening",
  "approved",
  "contracting",
  "payment_pending",
  "delivery_pending",
  "active",
  "payment_issue",
  "return_pending",
  "completed",
  "cancelled",
  "rejected",
]);

export const STATUS_LABELS: Record<string, string> = {
  new: "新規相談",
  hearing: "ヒアリング中",
  vehicle_search: "車両確認中",
  proposal_ready: "提案準備完了",
  proposed: "提案済み",
  application_received: "申込受付",
  screening: "審査中",
  approved: "審査承認",
  contracting: "契約手続き中",
  payment_pending: "決済待ち",
  delivery_pending: "引渡し待ち",
  active: "利用中",
  payment_issue: "未払い",
  return_pending: "返却予定",
  completed: "契約終了",
  cancelled: "キャンセル",
  rejected: "審査否決",
};

export const vanApplicationsTable = pgTable("van_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  conversationId: integer("conversation_id"),
  status: vanApplicationStatusEnum("status").notNull().default("new"),
  assignedAdminId: integer("assigned_admin_id"),
  area: text("area"),
  prefecture: text("prefecture"),
  startDate: text("start_date"),
  monthlyBudget: integer("monthly_budget"),
  vehiclePreference: text("vehicle_preference"),
  purpose: text("purpose"),
  deliveryType: text("delivery_type"),
  durationMonths: integer("duration_months"),
  insuranceStatus: text("insurance_status"),
  hasBlackNumber: boolean("has_black_number"),
  hasDeliveryExperience: boolean("has_delivery_experience"),
  currentVehicle: text("current_vehicle"),
  applicantName: text("applicant_name"),
  phone: text("phone"),
  email: text("email"),
  dob: text("dob"),
  address: text("address"),
  licenseInfo: text("license_info"),
  aiSummary: text("ai_summary"),
  adminNotes: text("admin_notes"),
  requestText: text("request_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanApplicationSchema = createInsertSchema(vanApplicationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVanApplication = z.infer<typeof insertVanApplicationSchema>;
export type VanApplication = typeof vanApplicationsTable.$inferSelect;
