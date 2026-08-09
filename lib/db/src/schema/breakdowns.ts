import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanContractsTable } from "./van_contracts";

export const breakdownStatusEnum = pgEnum("breakdown_status", [
  "reported",      // 報告受付
  "in_progress",   // 対応中
  "resolved",      // 解決済み
  "closed",        // クローズ
]);

export const breakdownsTable = pgTable("breakdowns", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id),
  userId: integer("user_id").references(() => usersTable.id).notNull(),

  symptom: text("symptom"),                   // 症状
  warningLights: text("warning_lights"),      // 警告灯
  occurredAt: text("occurred_at"),            // 発生日時
  location: text("location"),                 // 現在地
  canDrive: boolean("can_drive"),             // 自走可否
  photos: text("photos"),                     // JSON配列（オブジェクトストレージパス）
  videos: text("videos"),                     // JSON配列
  userComment: text("user_comment"),

  // AI サマリー
  aiSummary: text("ai_summary"),

  status: breakdownStatusEnum("status").notNull().default("reported"),
  adminNotes: text("admin_notes"),
  rentalCompanyNotifiedAt: timestamp("rental_company_notified_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBreakdownSchema = createInsertSchema(breakdownsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBreakdown = z.infer<typeof insertBreakdownSchema>;
export type Breakdown = typeof breakdownsTable.$inferSelect;
