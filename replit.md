# CHAT-LOGI

日本語対応の物流管理プラットフォーム。チャット形式で配送依頼ができ、AIが自動的に運賃・車両・日程を提案する。

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — APIサーバー起動 (port 8080)
- `pnpm --filter @workspace/sinjapan run dev` — フロントエンド起動 (port 19585)
- `pnpm run typecheck` — 全パッケージのタイプチェック
- `pnpm run build` — タイプチェック＋ビルド
- `pnpm --filter @workspace/api-spec run codegen` — OpenAPI spec からフック・Zodスキーマ再生成
- `pnpm --filter @workspace/db run push` — DBスキーマ適用（開発用）
- Required env: `DATABASE_URL`, `SESSION_SECRET`, `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- フロントエンド: React 19 + Vite + Wouter + TanStack Query + Tailwind CSS
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: Replit AI Integrations (OpenAI) + 独自日本語物流エンジン
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/sinjapan/src/pages/` — 全ページ（admin/, blog/, ユーザー向けページ）
- `artifacts/sinjapan/src/components/layout/` — AdminLayout, UserLayout
- `artifacts/api-server/src/routes/` — 22種類のAPIルート
- `artifacts/api-server/src/lib/ai.ts` — 日本語物流AIエンジン
- `lib/db/src/schema/` — 15テーブルのDBスキーマ
- `lib/api-spec/openapi.yaml` — OpenAPI仕様書

## Architecture decisions

- チャット形式でAIが荷物情報を聞き出し、自動で配車・運賃計算を行う
- セッション認証（express-session + PostgreSQL store）
- Bearerトークン認証もサポート（モバイル向け）
- 管理者・一般ユーザー・ドライバーの3ロール対応

## Product

- ランディングページ（LP）でチャット形式の配送依頼体験
- ユーザーダッシュボード：配送一覧・チャット・支払い・請求書・設定
- 管理者ダッシュボード：配送管理・顧客管理・運送会社・請求・財務・マーケティング・SEO・ブログ
- ドライバーポータル・マスターカード機能

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- APIサーバーの `sessions` テーブルは手動で作成済み（drizzle schemaには含まれない）
- `--env-file=../../.env` フラグは削除済み（Replitは環境変数を自動注入）
- `lib/api-client-react` の `custom-fetch` エクスポートが必要（package.jsonに追加済み）

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
