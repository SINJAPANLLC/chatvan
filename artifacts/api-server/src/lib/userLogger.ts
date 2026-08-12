/**
 * ユーザー行動ログ記録ヘルパー
 * 各ルートで import して呼ぶだけでログを非同期保存する
 */
import { db } from "@workspace/db";
import { userActivityLogsTable } from "@workspace/db";
import type { Request } from "express";

export type UserAction =
  | "login"
  | "login_failed"
  | "register"
  | "logout"
  | "chat_start"
  | "chat_message"
  | "apply"
  | "cancel"
  | "profile_update"
  | "view_proposal"
  | "proposal_accepted"
  | "contract_started"
  | "contract_ended"
  | "payment_completed"
  | "password_reset_request"
  | "kyc_uploaded"
  | "contact_sent";

const ACTION_LABELS: Record<UserAction, string> = {
  login:                  "ログイン",
  login_failed:           "ログイン失敗",
  register:               "会員登録",
  logout:                 "ログアウト",
  chat_start:             "相談開始",
  chat_message:           "メッセージ送信",
  apply:                  "申込確定",
  cancel:                 "キャンセル",
  profile_update:         "プロフィール更新",
  view_proposal:          "提案確認",
  proposal_accepted:      "提案承諾",
  contract_started:       "契約開始",
  contract_ended:         "契約終了",
  payment_completed:      "決済完了",
  password_reset_request: "パスワードリセット要求",
  kyc_uploaded:           "本人確認書類アップロード",
  contact_sent:           "お問い合わせ送信",
};

interface LogOptions {
  userId?:     number | null;
  userName?:   string | null;
  userEmail?:  string | null;
  action:      UserAction;
  detail?:     string;
  targetId?:   string | number | null;
  targetType?: string;
  req?:        Request;
}

export async function logUserActivity(opts: LogOptions): Promise<void> {
  try {
    await db.insert(userActivityLogsTable).values({
      userId:     opts.userId    ?? null,
      userName:   opts.userName  ?? null,
      userEmail:  opts.userEmail ?? null,
      action:     opts.action,
      label:      ACTION_LABELS[opts.action] ?? opts.action,
      detail:     opts.detail    ?? null,
      targetId:   opts.targetId != null ? String(opts.targetId) : null,
      targetType: opts.targetType ?? null,
      ipAddress:  opts.req ? (opts.req.ip ?? opts.req.headers["x-forwarded-for"] as string ?? null) : null,
      userAgent:  opts.req ? (opts.req.headers["user-agent"] ?? null) : null,
    });
  } catch (err) {
    // ログ失敗でメイン処理を止めない
    console.warn("[userLogger] failed to write activity log:", err);
  }
}
