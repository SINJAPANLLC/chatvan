---
name: Admin list completeness
description: Admin lists must not present a paginated subset as the complete searchable dataset.
---

管理一覧でローカル検索・ローカル件数表示を行う場合、取得対象が全件であることを保証する。全件を取得しない設計なら、サーバー側検索とページネーションを実装し、画面に表示中件数と総件数を明示する。

**Why:** 相談一覧がAPIの初期ページだけを取得していたため、実データより少ない件数を「全件」として表示・検索してしまった。

**How to apply:** 新しい一覧画面では、APIの既定limitとレスポンスの総件数を確認する。利用規模に合う上限を明示的に指定するか、総件数・ページ移動・検索対象の範囲が一致する構成にする。