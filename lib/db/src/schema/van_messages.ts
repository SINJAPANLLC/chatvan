import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vanApplicationsTable } from "./van_applications";

export const vanMessagesTable = pgTable("van_messages", {
  id: serial("id").primaryKey(),
  vanApplicationId: integer("van_application_id")
    .notNull()
    .references(() => vanApplicationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVanMessageSchema = createInsertSchema(vanMessagesTable).omit({
  id: true,
  createdAt: true,
});

export type VanMessage = typeof vanMessagesTable.$inferSelect;
export type InsertVanMessage = z.infer<typeof insertVanMessageSchema>;
