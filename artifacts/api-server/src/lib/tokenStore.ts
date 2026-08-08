import { pool } from "@workspace/db";

interface TokenData {
  userId: number;
  userRole: string;
  userEmail: string;
}

export function generateToken(): string {
  const { randomBytes } = require("crypto");
  return randomBytes(32).toString("hex");
}

export async function setToken(token: string, data: TokenData): Promise<void> {
  await pool.query(
    `INSERT INTO auth_tokens (token, user_id, user_role, user_email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           user_role = EXCLUDED.user_role,
           user_email = EXCLUDED.user_email,
           expires_at = NOW() + INTERVAL '30 days'`,
    [token, data.userId, data.userRole, data.userEmail]
  );
}

export async function getToken(token: string): Promise<TokenData | null> {
  const { rows } = await pool.query(
    `SELECT user_id, user_role, user_email FROM auth_tokens
     WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { userId: row.user_id, userRole: row.user_role, userEmail: row.user_email };
}

export async function deleteToken(token: string): Promise<void> {
  await pool.query(`DELETE FROM auth_tokens WHERE token = $1`, [token]);
}

// 期限切れトークンを定期削除
setInterval(() => {
  pool.query(`DELETE FROM auth_tokens WHERE expires_at < NOW()`).catch(() => {});
}, 60 * 60 * 1000); // 1時間ごと
