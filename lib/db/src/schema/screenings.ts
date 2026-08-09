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

export const screeningsTable = pgTable("screenings", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").references(() => vanApplicationsTable.id).notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),

  result: screeningResultEnum("result").notNull().default("pending"),
  method: text("method").default("manual"),  // manual / ekyc_api (将来)
  conditions: text("conditions"),            // conditional の場合の条件
  reason: text("reason"),                    // rejected の場合の理由
  adminNotes: text("admin_notes"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScreeningSchema = createInsertSchema(screeningsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertScreening = z.infer<typeof insertScreeningSchema>;
export type Screening = typeof screeningsTable.$inferSelect;
