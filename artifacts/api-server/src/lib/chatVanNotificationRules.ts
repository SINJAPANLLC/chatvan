export type NotificationRecipient = "利用者" | "レンタル会社" | "管理者";
export type InAppDelivery = "always" | "registered_recipient" | "none";

export type ChatVanNotificationRule = {
  key: string;
  category: string;
  label: string;
  trigger: string;
  recipients: NotificationRecipient[];
  email: boolean;
  inApp: InAppDelivery;
};

/**
 * 管理画面に表示する通知仕様の唯一の定義。
 * 新しいChat VAN通知を追加する時は、発火処理とこの定義を同時に更新する。
 */
export const CHAT_VAN_NOTIFICATION_RULES: readonly ChatVanNotificationRule[] = [
  { key: "account_registered", category: "会員", label: "会員登録", trigger: "利用者が新規登録した時", recipients: ["利用者"], email: true, inApp: "none" },
  { key: "password_reset", category: "会員", label: "パスワードリセット", trigger: "パスワードリセットをリクエストした時", recipients: ["利用者"], email: true, inApp: "none" },
  { key: "vehicle_proposal", category: "相談", label: "提案送信", trigger: "管理者が車両提案を送信した時", recipients: ["利用者"], email: true, inApp: "always" },
  { key: "application_received", category: "相談", label: "申込受付", trigger: "利用者が申込みを確定した時", recipients: ["利用者", "管理者"], email: true, inApp: "always" },
  { key: "usage_started", category: "契約", label: "利用開始", trigger: "決済または受け取り確認が完了した時", recipients: ["利用者", "レンタル会社", "管理者"], email: true, inApp: "registered_recipient" },
  { key: "return_reminder", category: "契約", label: "返却予定", trigger: "返却予定日の7日前（日本時間）", recipients: ["利用者", "レンタル会社"], email: true, inApp: "registered_recipient" },
  { key: "contract_completed", category: "契約", label: "契約終了", trigger: "車両返却が確認された時", recipients: ["利用者", "レンタル会社", "管理者"], email: true, inApp: "registered_recipient" },
  { key: "cancellation_requested", category: "契約", label: "解約申請", trigger: "利用者が解約を申請した時", recipients: ["利用者", "レンタル会社", "管理者"], email: true, inApp: "registered_recipient" },
  { key: "payment_completed", category: "決済", label: "決済完了", trigger: "初回・月額・追加のカード決済が完了した時", recipients: ["利用者", "レンタル会社"], email: true, inApp: "registered_recipient" },
  { key: "contact_received", category: "お問い合わせ", label: "受付確認", trigger: "お問い合わせフォームが送信された時", recipients: ["利用者", "管理者"], email: true, inApp: "registered_recipient" },
  { key: "contact_replied", category: "お問い合わせ", label: "返信通知", trigger: "管理者がお問い合わせに返信した時", recipients: ["利用者"], email: true, inApp: "registered_recipient" },
];