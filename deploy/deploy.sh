#!/bin/bash
# ============================================================
# Chat VAN — デプロイスクリプト（アップデート用）
# 実行: bash /var/www/chatvan/deploy/deploy.sh
# ============================================================
set -euo pipefail

APP_DIR="/var/www/chatvan"
PM2_NAME="chatvan-api"
LOG_FILE="/var/log/pm2/chatvan-deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }

cd "${APP_DIR}"
mkdir -p /var/log/pm2

log "=== Chat VAN デプロイ開始 ==="

# --- nvm / node を読み込む ---
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm use default 2>/dev/null || true
fi

log "Node.js: $(node -v), pnpm: $(pnpm -v)"

log "[1/5] git pull"
git pull origin main

log "[2/5] pnpm install"
# pnpm 9.x (lockfileVersion 9.0 対応) で実行
pnpm install --frozen-lockfile

log "[3/5] API サーバービルド"
pnpm --filter @workspace/api-server run build

log "[4/5] フロントエンドビルド（静的ファイル生成）"
NODE_ENV=production \
  pnpm --filter @workspace/sinjapan run build

log "[5/5] PM2 起動"
# stop → ポート強制解放 → start（マイグレーションが長いため reload/restart は競合しやすい）
pm2 stop "${PM2_NAME}" 2>/dev/null || true
sleep 3
fuser -k 4820/tcp 2>/dev/null || true
sleep 2
pm2 start "${APP_DIR}/deploy/ecosystem.config.cjs" --env production
log "  → pm2 start 完了"

# PM2 リストを表示
pm2 list

log "=== デプロイ完了 ✅ ==="
log "ポート確認: curl -s http://127.0.0.1:4820/api/public/seo | head -c 100"
