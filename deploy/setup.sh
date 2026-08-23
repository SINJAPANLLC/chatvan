#!/bin/bash
# ============================================================
# Chat VAN — VPS 初回セットアップスクリプト
# 対象: Ubuntu 24.04 LTS
# 実行: bash deploy/setup.sh
# ============================================================
set -euo pipefail

APP_DIR="/var/www/chatvan"
REPO_URL="https://github.com/SINJAPANLLC/chatvan.git"
# pnpm 9.x は Node 18+ に対応。lockfileVersion 9.0 と一致。
# pnpm 10/11 は Node 22.13+ が必要なので使わない。
PNPM_VERSION="9"

echo "=== [1/7] 依存パッケージをインストール ==="
apt-get update -y
apt-get install -y git curl nginx certbot python3-certbot-nginx

echo "=== [2/7] Node.js を確認 ==="
# nvm がなければインストール
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

# Node 20 以上でなければインストール（VPSに既にあれば skip）
NODE_MAJOR=$(node -e "process.stdout.write(String(+process.versions.node.split('.')[0]))" 2>/dev/null || echo "0")
if [ "${NODE_MAJOR}" -lt 20 ]; then
  nvm install 20
  nvm alias default 20
fi
nvm use default
echo "Node.js: $(node -v)"

echo "=== [3/7] pnpm ${PNPM_VERSION} をインストール ==="
# pnpm 9.x = lockfileVersion 9.0 と互換、Node 18/20 対応
npm install -g "pnpm@${PNPM_VERSION}"
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
