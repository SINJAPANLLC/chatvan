---
name: Chat VAN DB Statuses
description: van_applications / vehicles / van_contracts の English ステータス値と日本語 UI ラベルのマッピング
---

## van_applications.status (English internal)
hearing → 相談受付中
vehicle_search → 車両確認中
proposal_sent → 提案送信済
proposal_accepted → 提案確定
kyc_pending → 本人確認待ち
screening → 審査中
contract_pending → 契約待ち
contracting → 契約手続き中
active → 利用中
pending_delivery → 納車待ち
return_scheduled → 返却予定
completed → 完了
rejected → 却下

## vehicles.status
draft / reviewing / available / reserved / rented / maintenance / unavailable

## van_contracts.status
contracting / pending_delivery / active / return_scheduled / completed / cancelled

**Why:** DB migrate-van-enums.ts で全テーブルを Japanese → English に変換済み。
UI ラベルは STATUS_LABELS オブジェクトで変換すること。van.ts の API は English 値を使用。

**How to apply:** 新規ページ・API エンドポイントでステータス比較は必ず English 値を使う。
表示時は STATUS_LABELS[status] || status でフォールバック。

## 新規テーブル (migrate-full.ts 適用済み)
screenings, van_payments, van_payment_retries, identity_verifications,
insurance_policies, gps_devices, gps_locations, van_returns, van_return_inspections,
recovery_cases, audit_logs

## Admin API エンドポイント (追加済み)
GET/PUT /api/van/admin/screenings
GET /api/van/admin/payments
GET /api/van/admin/gps/devices
GET/POST /api/van/admin/insurance
GET/PUT /api/van/admin/incidents
GET/PUT /api/van/admin/returns
GET /api/van/admin/audit-logs
POST /api/van/incidents (ユーザー: 事故・故障報告)
POST /api/van/returns (ユーザー: 返却申請)
