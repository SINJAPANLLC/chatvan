import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const lineConversationsTable = pgTable("line_conversations", {
  id: serial("id").primaryKey(),
  lineUserId: text("line_user_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LineConversation = typeof lineConversationsTable.$inferSelect;
