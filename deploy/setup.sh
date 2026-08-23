#!/bin/bash
# ============================================================
# Chat VAN — VPS 初回セットアップスクリプト
# 対象: Ubuntu 24.04 LTS
# 実行: bash deploy/setup.sh
# ============================================================
set -euo pipefail

APP_DIR="/var/www/chatvan"
REPO_URL="https://github.com/SINJAPANLLC/chatvan.git"
NODE_VERSION="20"

echo "=== [1/7] 依存パッケージをインストール ==="
apt-get update -y
apt-get install -y git curl nginx certbot python3-certbot-nginx

echo "=== [2/7] Node.js ${NODE_VERSION} を nvm でインストール ==="
if ! command -v node &>/dev/null || [[ "$(node -e 'process.exit(+process.versions.node.split(".")[0]<20)')" ]]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm install "${NODE_VERSION}"
  nvm alias default "${NODE_VERSION}"
  nvm use default
fi
node -v

echo "=== [3/7] pnpm をインストール ==="
npm install -g pnpm@latest
pnpm -v

echo "=== [4/7] PM2 をインストール ==="
npm install -g pm2@latest
pm2 -v

echo "=== [5/7] リポジトリをクローン ==="
mkdir -p "$(dirname "${APP_DIR}")"
if [ -d "${APP_DIR}/.git" ]; then
  echo "  → 既存のリポジトリを pull します"
  cd "${APP_DIR}" && git pull origin main
else
  git clone "${REPO_URL}" "${APP_DIR}"
fi
cd "${APP_DIR}"

echo "=== [6/7] .env.production を作成 ==="
if [ ! -f "${APP_DIR}/.env.production" ]; then
  cp deploy/.env.production.example "${APP_DIR}/.env.production"
  echo ""
  echo "  ⚠️  ${APP_DIR}/.env.production に実際の値を入力してください！"
  echo "  その後 deploy/deploy.sh を実行してビルド・起動してください。"
  echo ""
else
  echo "  → .env.production は既に存在します（スキップ）"
fi

echo "=== [7/7] nginx サイト設定を配置 ==="
cp "${APP_DIR}/deploy/nginx-chat-van.com.conf" /etc/nginx/sites-available/chat-van.com
ln -sf /etc/nginx/sites-available/chat-van.com /etc/nginx/sites-enabled/chat-van.com
nginx -t
systemctl reload nginx

mkdir -p /var/log/pm2

echo ""
echo "✅ 初回セットアップ完了"
echo ""
echo "次のステップ:"
echo "  1. ${APP_DIR}/.env.production を編集して DB・シークレット等を設定"
echo "  2. bash ${APP_DIR}/deploy/deploy.sh でビルド＆起動"
echo "  3. SSL証明書を取得: certbot --nginx -d chat-van.com -d www.chat-van.com"
echo "  4. PM2 を OS 起動時に自動起動: pm2 startup && pm2 save"
