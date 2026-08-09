import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

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

export const VAN_APPLICATION_STATUS_LABELS: Record<string, string> = {
  new:                  "相談受付",
  hearing:              "条件確認中",
  vehicle_search:       "車両確認中",
  proposal_ready:       "提案準備中",
  proposed:             "ご提案済み",
  application_received: "申込受付",
  screening:            "審査中",
  approved:             "審査承認",
  contracting:          "契約手続き中",
  payment_pending:      "お支払い待ち",
  delivery_pending:     "車両受取待ち",
  active:               "利用中",
  payment_issue:        "お支払い確認中",
  return_pending:       "返却予定",
  completed:            "契約終了",
  cancelled:            "キャンセル",
  rejected:             "審査否決",
};

export const vanApplicationsTable = pgTable("van_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  conversationId: integer("conversation_id"),
  status: vanApplicationStatusEnum("status").notNull().default("new"),

  // ヒアリング情報
  area: text("area"),
  startDate: text("start_date"),
  monthlyBudget: integer("monthly_budget"),
  vehiclePreference: text("vehicle_preference"),
  purpose: text("purpose"),
  durationMonths: integer("duration_months"),
  deliveryType: text("delivery_type"),           // 配送案件種類
  insuranceStatus: text("insurance_status"),
  hasBlackNumber: boolean("has_black_number"),
  hasDeliveryExperience: boolean("has_delivery_experience"),
  currentVehicle: text("current_vehicle"),       // 現在車両所有有無

  // 申込者情報
  applicantName: text("applicant_name"),
  phone: text("phone"),
  email: text("email"),
  dob: text("dob"),
  address: text("address"),
  licenseInfo: text("license_info"),

  // 管理
  adminNotes: text("admin_notes"),
  requestText: text("request_text"),
  assignedTo: text("assigned_to"),               // 担当者

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanApplicationSchema = createInsertSchema(vanApplicationsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertVanApplication = z.infer<typeof insertVanApplicationSchema>;
export type VanApplication = typeof vanApplicationsTable.$inferSelect;
