---
name: Dashboard metric failures
description: Partial dashboard aggregation errors must remain visible rather than silently appearing as zero.
---

`Promise.allSettled` でダッシュボードの部分集計を続行する場合、失敗した各集計を必ずサーバーログへ記録する。失敗をゼロ値のまま表示してはならない。

**Why:** ステータス定義とSQLの値が一致しない集計が拒否されても、画面では事故件数が0件に見えてしまったため。

**How to apply:** ダッシュボードへ新しいDB集計を追加するときは、実際のenum値で照合する。部分的な失敗を許容するなら、拒否された結果を監視可能なログに残し、数値の正しさを確認できる状態にする。