---
name: Contract incident reporting
description: Contract-level accident and breakdown reports must remain visible to the assigned rental company across legacy and canonical storage.
---

事故・故障報告は、契約チャットの定型報告だけに依存せず、契約ID付きの正式な事故記録としても保存する。協力会社の契約画面では正式記録を優先しつつ、移行前の定型チャット報告も重複なく表示する。

**Why:** 既存の報告メッセージが保存されていても、協力会社向けの取得処理が送信者ロールを特定の値に限定すると、実際の報告が0件として隠れることがある。

**How to apply:** 契約に関する事故・故障導線を変更する時は、保存先・契約ID・協力会社一覧の取得条件を一緒に確認し、送信成功の表示はサーバー保存成功後だけにする。