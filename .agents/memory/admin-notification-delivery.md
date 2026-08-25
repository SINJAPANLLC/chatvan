---
name: Admin notification delivery
description: Rules for reliable fan-out, delivery tracking, and safe retries of administrator notifications.
---

管理者の対応が必要なイベントは、固定の単一メールアドレスへ送らず、登録済みの全管理者へアプリ内通知と個別メールを作成する。

**Why:** 固定宛先だけの送信では、他の管理者の通知パネルに履歴が残らず、送信失敗や見逃しを追跡できない。再送を古い通知の作成時刻だけで判定すると、並行した再送が重複メールを発生させる。

**How to apply:** 管理者向けイベントは共通の配信経路を使い、受信者ごとの送信状態を記録する。再送は各送信試行の開始時刻を原子的に取得してから行い、失敗または長時間の送信中状態は管理画面で復旧可能にする。通知配信が失敗しても、元の申請・決済・登録などの業務イベントは失敗させない。