import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const userActivityLogsTable = pgTable("user_activity_logs", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id"),          // null = 未ログイン
  userName:  text("user_name"),           // スナップショット
  userEmail: text("user_email"),          // スナップショット

  action:    text("action").notNull(),    // login / register / logout / chat_start / chat_message / apply / cancel / profile_update / view_proposal
  label:     text("label"),              // 表示用のラベル（例: "相談開始", "申込確定"）
  detail:    text("detail"),             // 自由テキスト or JSON文字列
  targetId:  text("target_id"),          // 関連ID（applicationId等）
  targetType: text("target_type"),       // application / contract / vehicle etc

  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UserActivityLog = typeof userActivityLogsTable.$inferSelect;
