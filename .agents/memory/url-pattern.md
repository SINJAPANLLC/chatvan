---
name: URL pattern for manual fetch
description: sinjapan アプリで手動 fetch を使う際の正しい API URL 構築パターン
---

# 手動 fetch の API URL パターン

## ルール

```typescript
// ✅ 正しい
const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
// → /sinjapan/api/van/contracts/1/sign

// ❌ 間違い（末尾スラッシュ削除で sinjapanapi/... になる）
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiUrl = (path: string) => `${BASE}api${path}`;
```

**Why:** Vite の `import.meta.env.BASE_URL` は `/sinjapan/`（末尾スラッシュあり）。スラッシュを削除すると `api` が直結して `/sinjapanapi/...` になりAPIに届かない。

**How to apply:** 手動 fetch を書く全ファイルで `import.meta.env.BASE_URL` をそのまま使う。管理画面の `admin/*.tsx` は既にこのパターン（`${import.meta.env.BASE_URL}api${path}`）を採用しているので参考にする。

また手動 fetch には必ず `credentials: 'include'` を付与すること。
