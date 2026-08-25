---
name: Pre-pickup card settlement
description: Card verification, pre-pickup charge, and vehicle handover must remain separate and recoverable.
---

カード確認の少額オーソリは、成功時に必ず直後に解放する。本決済は受け取り前に完了させ、決済または請求書入金の確認前に受け取り・利用開始・車両の貸出中遷移を許可しない。

**Why:** 少額オーソリを本決済と取り違えると利用者へ誤解を与え、決済失敗時に車両だけが貸し出されると回収不能な債権リスクになる。再送・中断復旧でも同じ案件を重複請求してはならない。

**How to apply:** 決済導線を追加・変更する場合は、案件単位の冪等性、未解放オーソリの追跡と解放、成功済み決済の再利用、受け取り時の独立した決済確認を一組として実装する。請求書払いは入金確認を同じ受け取り条件として扱う。