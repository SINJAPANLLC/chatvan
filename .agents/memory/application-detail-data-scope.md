---
name: Application detail data scope
description: Contract-scoped records in an application detail view must not be fetched only by user ID.
---

申込詳細で契約に属する情報（事故・故障、請求、決済、GPS、保険など）を表示する場合は、対象利用者だけではなく、現在の申込に紐づく契約IDで必ず絞り込む。

**Why:** 同じ利用者が複数契約を持つと、利用者IDだけの検索では別契約の事故や請求書が混ざり、誤った契約の請求状態を操作するおそれがある。

**How to apply:** 新たな契約関連レコードには契約IDを保存する。既存データを移行する際は、識別可能な安全なキーで再紐付けてから、詳細APIを契約IDで検索する。