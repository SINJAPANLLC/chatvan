import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),            // Admin ID or "system"
  actorEmail: text("actor_email"),
  action: text("action").notNull(),          // 操作種別: vehicle.update / screening.approve 等
  targetType: text("target_type"),           // vehicle / application / contract / payment 等
  targetId: integer("target_id"),
  before: text("before"),                    // JSON: 変更前
  after: text("after"),                      // JSON: 変更後
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true, createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
