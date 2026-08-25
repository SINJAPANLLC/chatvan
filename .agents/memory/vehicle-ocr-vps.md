---
name: Vehicle OCR on VPS
description: Production prerequisites for PDF vehicle-inspection-document OCR.
---

PDF車検証OCRをVPSで実行する場合は、PDFを画像化するシステムツールをアプリと同時に管理する。

**Why:** 本番VPSには開発環境と異なり、PDF変換コマンドが標準で入っていない場合があり、AI呼び出し前に処理が停止する。

**How to apply:** PDF/HEIC OCRを使うデプロイでは、`poppler-utils` と `imagemagick` の存在確認をデプロイ手順に含める。OpenAI設定だけ確認して解決したと判断しない。