import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const vanApplicationStatusEnum = pgEnum("van_application_status", [
  "相談中",      // チャットでAIがヒアリング中
  "確認中",      // AIが情報収集完了、管理者確認待ち
  "提案送信済",  // 管理者が車両提案を送信済み、ユーザー返答待ち
  "申込受付",    // ユーザーが申込みボタンを押した
  "審査中",      // 管理者が審査中
  "提案確定",    // 審査OK、提案確定
  "契約手続き",  // 契約書類手続き中
  "利用開始",    // 利用開始日到達
  "利用中",      // 貸出中
  "返却予定",    // 返却日が近い
  "契約終了",    // 契約完了
  "キャンセル",  // キャンセル
]);

export const vanApplicationsTable = pgTable("van_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  conversationId: integer("conversation_id"), // conversations tableのID
  status: vanApplicationStatusEnum("status").notNull().default("相談中"),

  // ヒアリング情報
  area: text("area"),                        // 利用都道府県・エリア
  startDate: text("start_date"),             // 利用開始希望日
  monthlyBudget: integer("monthly_budget"),  // 希望月額予算（円）
  vehiclePreference: text("vehicle_preference"), // 希望車種
  purpose: text("purpose"),                  // 利用目的
  durationMonths: integer("duration_months"), // 希望利用期間（月）
  insuranceStatus: text("insurance_status"), // 保険加入状況
  hasBlackNumber: boolean("has_black_number"), // 黒ナンバー取得済みか
  hasDeliveryExperience: boolean("has_delivery_experience"), // 配送経験有無

  // 申込み者情報
  applicantName: text("applicant_name"),     // 氏名
  phone: text("phone"),                      // 電話番号
  email: text("email"),                      // メールアドレス
  dob: text("dob"),                          // 生年月日
  address: text("address"),                  // 住所
  licenseInfo: text("license_info"),         // 運転免許証情報

  // 管理メモ
  adminNotes: text("admin_notes"),
  requestText: text("request_text"),         // 最初のメッセージ（全文）

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVanApplicationSchema = createInsertSchema(vanApplicationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVanApplication = z.infer<typeof insertVanApplicationSchema>;
export type VanApplication = typeof vanApplicationsTable.$inferSelect;
