import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const prospectsTable = pgTable("prospects", {
  id:          serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name"),
  email:       text("email").notNull(),
  phone:       text("phone"),
  industry:    text("industry"),
  prefecture:  text("prefecture"),
  /** unsent | sent */
  status:      text("status").notNull().default("unsent"),
  notes:       text("notes"),
  sentAt:      timestamp("sent_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type Prospect = typeof prospectsTable.$inferSelect;
