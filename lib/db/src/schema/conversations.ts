import { pgEnum, pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shipmentsTable } from "./shipments";

export const senderTypeEnum = pgEnum("sender_type", ["user", "ai"]);

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").references(() => shipmentsTable.id).notNull(),
  sender: senderTypeEnum("sender").notNull(),
  message: text("message").notNull(),
  structuredData: text("structured_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversationsTable.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
