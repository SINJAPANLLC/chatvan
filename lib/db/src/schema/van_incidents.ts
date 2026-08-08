import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { vanContractsTable } from "./van_contracts";

export const vanIncidentTypeEnum = pgEnum("van_incident_type", [
  "accident",
  "breakdown",
  "other",
]);

export const vanIncidentStatusEnum = pgEnum("van_incident_status", [
  "報告受付",
  "対応中",
  "解決済み",
]);

export const vanIncidentsTable = pgTable("van_incidents", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => vanContractsTable.id),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  incidentType: vanIncidentTypeEnum("incident_type").notNull(),
  status: vanIncidentStatusEnum("status").notNull().default("報告受付"),
  description: text("description"),          // 状況説明
  location: text("location"),                // 現在地
  photos: text("photos"),                    // JSON配列
  // 事故専用
  hasInjuries: boolean("has_injuries"),
  policeContacted: boolean("police_contacted"),
  counterpartInfo: text("counterpart_info"), // 相手方情報
  // 故障専用
  canDrive: boolean("can_drive"),            // 自走可能か
  symptom: text("symptom"),                  // 症状
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanIncidentSchema = createInsertSchema(vanIncidentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVanIncident = z.infer<typeof insertVanIncidentSchema>;
export type VanIncident = typeof vanIncidentsTable.$inferSelect;
