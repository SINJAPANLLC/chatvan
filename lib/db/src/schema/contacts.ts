import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const contactsTable = pgTable("contacts", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  email:       text("email").notNull(),
  subject:     text("subject").notNull(),
  message:     text("message").notNull(),
  replied:     boolean("replied").notNull().default(false),
  replyBody:   text("reply_body"),
  repliedAt:   timestamp("replied_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type Contact = typeof contactsTable.$inferSelect;
