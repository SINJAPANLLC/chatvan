---
name: Square payment history
description: How to handle Square payments that are not linked to local Chat VAN contracts or shipments.
---

Square上に存在する決済であっても、ローカルのChat VAN契約または配送案件との対応関係が保存されていない場合、契約詳細の決済履歴として表示しない。

**Why:** 外部決済のメモだけでは、利用者・契約・案件を安全に一意特定できない。誤った契約へ決済を表示すると、支払い状況を誤認させる。

**How to apply:** 契約詳細では契約IDで保存された決済記録だけを表示する。外部Square履歴を取り込む場合は、先に信頼できる案件または契約との紐付けを保存する。