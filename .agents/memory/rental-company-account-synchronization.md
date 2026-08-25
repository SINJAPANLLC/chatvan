---
name: Rental company account synchronization
description: Rules for keeping rental-company profiles and their linked login accounts consistent without overwriting invited staff details.
---

会社プロフィールを正本にし、会社メールアドレスと一致する紐づきアカウントだけを代表ログインとして、担当者名・電話番号・ログインメールを同期する。紐づく協力会社アカウント全員には会社名を同期してよいが、招待された別担当者の個人連絡先は上書きしない。

**Why:** 1社に複数の担当者アカウントを紐づけられるため、会社設定の変更で全員の個人名・メール・電話を同一化すると、運用上の連絡先を失わせてしまう。一方で、初回登録時の代表アカウントは会社プロフィールと一貫している必要がある。

**How to apply:** 会社の新規登録・会社設定・管理者による会社更新では、会社と代表アカウントの同期を同一トランザクションで行う。会社メールは前後空白を除去して小文字化し、空欄を許可しない。既存の紐づきアカウントを補完する場合は、空欄だけを埋めて登録済みの値を上書きしない。