# Chat VAN — VPS デプロイ手順

## 構成

| 役割 | 詳細 |
|---|---|
| VPS | Ubuntu 24.04 LTS (`212.85.24.206`) |
| API ポート | **4820**（他アプリと競合しない固定値） |
| PM2 名 | `chatvan-api` |
| アプリ配置 | `/var/www/chatvan` |
| 静的ファイル | `/var/www/chatvan/artifacts/sinjapan/dist/public` |
| ドメイン | `chat-van.com` |

---

## 初回セットアップ

```bash
# VPS に SSH ログイン後
ssh root@212.85.24.206

# リポジトリをクローンしてセットアップを実行
git clone https://github.com/SINJAPANLLC/chatvan.git /var/www/chatvan
bash /var/www/chatvan/deploy/setup.sh
```

セットアップ後、`.env.production` を編集します。

```bash
nano /var/www/chatvan/.env.production
```

---

## `.env.production` の設定項目

```
NODE_ENV=production
PORT=4820
APP_BASE_URL=https://chat-van.com

LOCAL_UPLOAD_DIR=/var/lib/chatvan/uploads

NEON_DATABASE_URL=postgresql://...?sslmode=verify-full
SESSION_SECRET=（openssl rand -hex 32 で生成）
OPENAI_API_KEY=（OpenAI APIキー）
OPENAI_BASE_URL=https://api.openai.com/v1
SQUARE_ACCESS_TOKEN=（Square本番トークン）
SQUARE_ENV=production

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Chat VAN <noreply@chat-van.com>
```

### アップロードファイル

本番の車両写真・書類・本人確認画像は **VPSの `/var/lib/chatvan/uploads`** に保存されます。
この場所はリポジトリ外のため、通常の `git pull` やビルドでは消えません。`LOCAL_UPLOAD_DIR` は必ず上記のまま設定してください。

バックアップ時は、DBとあわせてこのディレクトリもバックアップ対象にしてください。

---

## ビルド＆起動

```bash
bash /var/www/chatvan/deploy/deploy.sh
```

---

## SSL 証明書（初回のみ）

```bash
certbot --nginx -d chat-van.com -d www.chat-van.com
```

---

## OS 起動時の自動起動

```bash
pm2 startup          # 表示されたコマンドをコピーして実行
pm2 save             # 現在のプロセスリストを保存
```

---

## 以降のアップデート

コードを GitHub に push した後、VPS で以下を実行するだけです。

```bash
bash /var/www/chatvan/deploy/deploy.sh
```

---

## よく使うコマンド

```bash
pm2 list                        # 全プロセスの状態確認
pm2 logs chatvan-api            # リアルタイムログ
pm2 restart chatvan-api         # 再起動
pm2 stop chatvan-api            # 停止

# ポート確認（4820 が使われているか）
ss -tlnp | grep 4820

# nginx 設定テスト
nginx -t && systemctl reload nginx

# SSL 証明書の更新（自動設定されているが手動実行も可能）
certbot renew --dry-run
```

---

## ポート割り当て一覧

VPS 上の既存アプリとの競合を避けるため、**4820 番を Chat VAN 専用**に予約しています。

| ポート | アプリ |
|---|---|
| 4820 | **chatvan-api**（このアプリ） |
| その他 | VPS 既存アプリ（変更なし） |
