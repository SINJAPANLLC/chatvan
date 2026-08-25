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
  criticalEmail: boolean;
};

/**
 * 管理画面に表示する通知仕様の唯一の定義。
 * 新しいChat VAN通知を追加する時は、発火処理とこの定義を同時に更新する。
 */
export const CHAT_VAN_NOTIFICATION_RULES: readonly ChatVanNotificationRule[] = [
  { key: "account_registered", category: "会員", label: "会員登録", trigger: "利用者が新規登録した時", recipients: ["利用者"], email: true, inApp: "none", criticalEmail: true },
  { key: "password_reset", category: "会員", label: "パスワードリセット", trigger: "パスワードリセットをリクエストした時", recipients: ["利用者"], email: true, inApp: "none", criticalEmail: false },
  { key: "consultation_received", category: "相談", label: "新規相談", trigger: "利用条件を含む相談が開始された時", recipients: ["管理者"], email: true, inApp: "always", criticalEmail: true },
  { key: "vehicle_proposal", category: "相談", label: "提案送信", trigger: "管理者が車両提案を送信した時", recipients: ["利用者"], email: true, inApp: "always", criticalEmail: false },
  { key: "application_received", category: "相談", label: "申込受付", trigger: "利用者が申込みを確定した時", recipients: ["利用者", "管理者"], email: true, inApp: "always", criticalEmail: true },
  { key: "usage_started", category: "契約", label: "利用開始", trigger: "決済または受け取り確認が完了した時", recipients: ["利用者", "レンタル会社", "管理者"], email: true, inApp: "registered_recipient", criticalEmail: false },
  { key: "return_reminder", category: "契約", label: "返却予定", trigger: "返却予定日の7日前（日本時間）", recipients: ["利用者", "レンタル会社"], email: true, inApp: "registered_recipient", criticalEmail: false },
  { key: "contract_completed", category: "契約", label: "契約終了", trigger: "車両返却が確認された時", recipients: ["利用者", "レンタル会社", "管理者"], email: true, inApp: "registered_recipient", criticalEmail: false },
  { key: "cancellation_requested", category: "契約", label: "解約申請", trigger: "利用者が解約を申請した時", recipients: ["利用者", "レンタル会社", "管理者"], email: true, inApp: "registered_recipient", criticalEmail: true },
  { key: "payment_completed", category: "決済", label: "決済完了", trigger: "初回・月額・追加のカード決済が完了した時", recipients: ["利用者", "レンタル会社"], email: true, inApp: "registered_recipient", criticalEmail: true },
  { key: "payment_failed", category: "決済", label: "決済失敗", trigger: "決済または再決済に失敗した時", recipients: ["利用者", "管理者"], email: true, inApp: "always", criticalEmail: true },
  { key: "incident", category: "緊急", label: "事故・故障", trigger: "事故・故障・緊急報告が送信された時", recipients: ["管理者"], email: true, inApp: "always", criticalEmail: true },
  { key: "company_registered", category: "協力会社", label: "会社登録申請", trigger: "レンタル会社の登録申請が届いた時", recipients: ["管理者"], email: true, inApp: "always", criticalEmail: true },
  { key: "contact_received", category: "お問い合わせ", label: "受付確認", trigger: "お問い合わせフォームが送信された時", recipients: ["利用者", "管理者"], email: true, inApp: "registered_recipient", criticalEmail: false },
  { key: "contact_replied", category: "お問い合わせ", label: "返信通知", trigger: "管理者がお問い合わせに返信した時", recipients: ["利用者"], email: true, inApp: "registered_recipient", criticalEmail: false },
];