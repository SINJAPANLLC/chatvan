---
name: GPS tracking lifecycle
description: Rules for browser-based location tracking in the Chat VAN user app.
---

利用者のブラウザ位置情報は、利用者用アプリを開いている間だけ追跡する。ただし、対象は利用中かつ位置情報取得へ同意済みの契約に限り、契約の終了・変更・同意撤回を検知したら直ちに停止する。

**Why:** 位置情報は安全管理に必要だが、契約外や同意なしに収集してはならない。複数契約時に別契約へ誤って紐付けることも防ぐ必要がある。

**How to apply:** 位置送信前にサーバーで契約の所有者・利用中状態・同意を確認する。管理画面の表示も必ず契約IDで絞り込み、利用者IDだけで位置履歴を取得しない。