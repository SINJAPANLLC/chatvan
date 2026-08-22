---
name: Chat VAN migration
description: Chat LOGI → Chat VAN への全面リメイク時の注意点とアーキテクチャ決定事項
---

## サービス
- Chat LOGI（物流AI）→ Chat VAN（軽バンレンタル相談）へ完全リメイク
- 運営: SIN JAPAN株式会社
- ユーザー体験: チャットでヒアリング → 管理者が手動で車両提案 → 申込み → 契約

## 新規DBテーブル
rental_companies, vehicles, van_applications, van_proposals, van_contracts, van_incidents, van_messages
- van_messages は messages テーブルとは別（messagesは旧shipment用でvanApplicationIdフィールドなし）
- `drizzle-kit push` は messages.ts の循環参照エラーで失敗 → 新テーブルはRAW SQLで作成

## codegen / Zod の注意点
- orval v8.23.0 + zod v3.25.76 の組み合わせで `zod.int()` / `zod.looseObject()` が生成される（zod v4構文）
- 生成後に `sed -i 's/zod\.int()/zod.number().int()/g'` と `sed -i 's/zod\.looseObject(/zod.object(/g'` で修正が必要
- `lib/api-spec/openapi.yaml` の `info.title: Api` は変更禁止（importパスが壊れる）

## 旧ルートの互換維持
- 旧 api-zod スキーマ（ShipmentBody等）が削除されたため shipments.ts, ai.ts, carriers.ts, pricing.ts のインポートが壊れる
- `type XxxBody = any;` に置き換えてビルドは通るが機能はdead codeになる（新フロントは使わない）

**Why:** 旧LOGIの全ルートを削除するリスクを避け、段階的に移行するため

## APIルートの決定事項
- `/van/start` は認証不要（匿名ユーザーも相談できる）
- van_applicationsのconversation_idはvan_applications.idと同値（簡略化）
- 通知テーブルに `link` フィールドはない、`title` フィールドが必須

## フロントエンドルーティング
- `/van/:id` → VanChat（チャット会話）
- `/van/:id/proposal` → VanProposal（提案カード）
- `/mypage` → MyPage（契約情報）
- `/admin/applications`, `/admin/vehicles`, `/admin/rental-companies`, `/admin/contracts` → 新規

## Neon接続の既定スキーマ
- Neonの接続ロールによっては、既定の`search_path`に`public`が含まれず、既存のスキーマ未指定SQLがテーブルを見つけられない。

**Why:** Neonのプール接続は起動パラメータでの`search_path`指定を受け付けないため、既存の未修飾SQLとの互換性をロール側で保つ必要がある。
