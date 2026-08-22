/**
 * Chat VAN — extra routes (screenings, audit logs, incidents, notifications)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { notifyAdmins } from "../lib/notifyHelpers";
import { logAdminAudit } from "../lib/auditLogger";

const router: IRouter = Router();

// helper: node-pg の QueryResult を配列として取得
function toRows(raw: unknown): unknown[] {
  return (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
}
function toRow(raw: unknown): unknown | null {
  const rows = toRows(raw);
  return rows[0] ?? null;
}

// ── 審査 (screenings) ─────────────────────────────────────────────────────
router.post("/van/screenings", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const adminId: number | undefined = (req.session as any)?.userId;
    const raw = await db.execute(sql`
      INSERT INTO screenings (application_id, user_id, screened_by, result, reason, risk_notes, conditions, screened_at)
      VALUES (${b.application_id}, ${b.user_id}, ${adminId}, ${b.result}, ${b.reason}, ${b.risk_notes}, ${b.conditions}, NOW())
      RETURNING *
    `);
    return res.status(201).json(toRow(raw));
  } catch (err) {
    console.error("create screening error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/van/screenings", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const raw = await db.execute(sql`
      SELECT s.*, u.name as user_name
      FROM screenings s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC LIMIT 100
    `);
    return res.json(toRows(raw));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 監査ログ (audit_logs) ─────────────────────────────────────────────────
router.get("/van/audit-logs", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const where = query
      ? sql`WHERE al.action ILIKE ${`%${query}%`}
          OR al.target_type ILIKE ${`%${query}%`}
          OR al.actor_name ILIKE ${`%${query}%`}`
      : sql``;
    const raw = await db.execute(sql`
      SELECT al.*, u.name as actor_name
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_id = u.id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const totalRaw = await db.execute(sql`SELECT COUNT(*)::int AS total FROM audit_logs al ${where}`);
    const total = Number((toRow(totalRaw) as any)?.total ?? 0);
    return res.json({ logs: toRows(raw), total, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 事故 (incidents) ─────────────────────────────────────────────────────
router.get("/van/incidents", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const raw = await db.execute(sql`
      SELECT i.*, u.name as user_name, u.phone as user_phone
      FROM van_incidents i
      LEFT JOIN users u ON i.user_id = u.id
      ORDER BY i.created_at DESC LIMIT 50
    `).catch(() => [] as unknown[]);
    return res.json(toRows(raw));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/van/incidents", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId: number | undefined = (req.session as any)?.userId;
    const b = req.body;
    const contractId = Number(b.contract_id);
    if (!userId || !Number.isInteger(contractId)) {
      return res.status(400).json({ error: "有効な契約を指定してください" });
    }
    const contractRows = await db.execute(sql`
      SELECT id FROM van_contracts
      WHERE id = ${contractId} AND user_id = ${userId}
      LIMIT 1
    `);
    if (!toRow(contractRows)) {
      return res.status(403).json({ error: "この契約の事故を登録する権限がありません" });
    }
    const raw = await db.execute(sql`
      INSERT INTO van_incidents (contract_id, user_id, type, description, location, occurred_at, has_injuries, police_contacted, can_drive, counterpart_info, user_comment, status)
      VALUES (${contractId}, ${userId}, ${b.type ?? 'accident'}, ${b.description}, ${b.location}, ${b.occurred_at}, ${b.has_injuries ?? false}, ${b.police_contacted ?? false}, ${b.can_drive ?? false}, ${b.counterpart_info}, ${b.user_comment ?? b.description}, 'reported')
      RETURNING *
    `);

    await notifyAdmins('🚨 Chat VAN - 事故報告', `事故が報告されました。場所: ${b.location ?? '不明'}`);
    return res.status(201).json(toRow(raw));
  } catch (err) {
    console.error("create incident error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 通知 POST (管理者から手動送信) ────────────────────────────────────────
router.post("/van/notifications", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, title, message } = req.body;
    const [notification] = await db.insert(notificationsTable).values({
      userId, title, message,
    }).returning();
    return res.status(201).json(notification);
  } catch (err) {
    console.error("send notification error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 免許証確認一覧 (Admin) ────────────────────────────────────────────────
router.get("/van/identity-verifications", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const conditions = status ? sql`WHERE iv.status = ${status}` : sql`WHERE 1=1`;
    const raw = await db.execute(sql`
      SELECT iv.*, u.name as user_name, u.email as user_email
      FROM identity_verifications iv
      LEFT JOIN users u ON iv.user_id = u.id
      ${conditions}
      ORDER BY iv.created_at DESC LIMIT 100
    `);
    return res.json(toRows(raw));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
