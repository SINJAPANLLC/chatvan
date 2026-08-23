/**
 * PM2 Ecosystem — Chat VAN
 * API ポート: 4820（VPS上の他アプリと競合しない固定値）
 *
 * 起動:  pm2 start deploy/ecosystem.config.cjs --env production
 * 更新:  pm2 reload chatvan-api
 * 停止:  pm2 stop chatvan-api
 */
module.exports = {
  apps: [
    {
      name: "chatvan-api",

      // Node を直接指定し --env-file でシークレットを読み込む（Node 20.6+）
      script: "node",
      args: [
        "--enable-source-maps",
        "--env-file=/var/www/chatvan/.env.production",
        "artifacts/api-server/dist/index.mjs",
      ].join(" "),

      cwd: "/var/www/chatvan",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",

      // ========= 非機密の固定値のみここに書く =========
      // 機密値（DB URL, SESSION_SECRET, SQUARE_ACCESS_TOKEN など）は
      // /var/www/chatvan/.env.production に書いてください（下記 README 参照）
      env_production: {
        NODE_ENV: "production",
        PORT: "4820",                          // ← 他アプリと絶対に重複しない専用ポート
        APP_BASE_URL: "https://chat-van.com",
        ADMIN_NOTIFY_EMAIL: "info@chat-van.com",
      },

      // ログ
      out_file: "/var/log/pm2/chatvan-api-out.log",
      error_file: "/var/log/pm2/chatvan-api-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
