import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanApplicationsTable } from "./van_applications";

export const screeningResultEnum = pgEnum("screening_result", [
  "pending",
  "approved",
  "conditional",
  "rejected",
]);

export const SCREENING_RESULT_LABELS: Record<string, string> = {
  pending: "審査中",
  approved: "承認",
  conditional: "条件付き承認",
  rejected: "否決",
};

export const screeningsTable = pgTable("screenings", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").references(() => vanApplicationsTable.id).notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),

  result: screeningResultEnum("result").notNull().default("pending"),
  reason: text("reason"),           // 審査結果の理由
  riskNotes: text("risk_notes"),    // リスクメモ（管理者内部）
  conditions: text("conditions"),   // 条件付き承認の場合の条件

  reviewedBy: integer("reviewed_by"),  // admin user id
  reviewedAt: timestamp("reviewed_at"),

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScreeningSchema = createInsertSchema(screeningsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScreening = z.infer<typeof insertScreeningSchema>;
export type Screening = typeof screeningsTable.$inferSelect;
