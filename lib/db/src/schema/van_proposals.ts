import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vanApplicationsTable } from "./van_applications";

export const vanProposalStatusEnum = pgEnum("van_proposal_status", [
  "sent",
  "accepted",
  "rejected",
]);

export const vanProposalsTable = pgTable("van_proposals", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").references(() => vanApplicationsTable.id).notNull(),
  vehicleIds: text("vehicle_ids").notNull(),  // JSON配列: [1, 2, 3]
  message: text("message"),
  notes: text("notes"),                        // 管理者内部メモ
  status: vanProposalStatusEnum("status").notNull().default("sent"),
  acceptedVehicleId: integer("accepted_vehicle_id"), // ユーザーが選んだ車両
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVanProposalSchema = createInsertSchema(vanProposalsTable).omit({
  id: true, createdAt: true, sentAt: true, respondedAt: true,
});

export type InsertVanProposal = z.infer<typeof insertVanProposalSchema>;
export type VanProposal = typeof vanProposalsTable.$inferSelect;
