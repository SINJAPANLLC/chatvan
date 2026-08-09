import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),           // 操作者ID（admin user id）
  actorType: text("actor_type"),          // admin / system / user
  actorName: text("actor_name"),          // 操作者名（snapshot）

  action: text("action").notNull(),       // create / update / delete / view / approve / reject etc
  targetType: text("target_type"),        // application / vehicle / contract / payment / gps / insurance etc
  targetId: text("target_id"),

  beforeData: text("before_data"),        // JSON（変更前）
  afterData: text("after_data"),          // JSON（変更後）

  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
