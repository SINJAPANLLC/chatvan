import { Router, Request, Response } from "express";
import { db, vanIncidentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { usersTable, notificationsTable } from "@workspace/db";

const router = Router();

function toRows(raw: unknown): unknown[] {
  return (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
}
function toRow(raw: unknown): unknown | null {
  return toRows(raw)[0] ?? null;
}

type IncidentType = "accident" | "breakdown" | "other";

function reportField(message: string, label: string): string | null {
  const line = message.split("\n").find(value => value.trim().startsWith(`▶ ${label}：`));
  return line?.trim().slice(`▶ ${label}：`.length).trim() || null;
}

/**
 * 契約チャットの定型報告を、表示用メッセージだけでなく契約に紐づく正式な事故記録にもする。
 * 送信者や画面側の検索条件が変わっても、協力会社が契約単位で必ず確認できるようにする。
 */
function parseIncidentReport(message: string): {
  incidentType: IncidentType;
  location: string | null;
  hasInjuries: boolean | null;
  policeContacted: boolean | null;
  canDrive: boolean | null;
  counterpartInfo: string | null;
  symptom: string | null;
} | null {
  const firstLine = message.split("\n")[0]?.trim();
  const incidentType = firstLine === "【交通事故】"
    ? "accident"
    : firstLine === "【車両故障】"
      ? "breakdown"
      : firstLine === "【盗難・不正使用】" || firstLine === "【その他トラブル】"
        ? "other"
        : null;
  if (!incidentType) return null;

  const injured = reportField(message, "負傷者");
  const police = reportField(message, "警察への連絡") ?? reportField(message, "警察への届出");
  const drivable = reportField(message, "走行可能");
  return {
    incidentType,
    location: reportField(message, "発生場所") ?? reportField(message, "現在地") ?? reportField(message, "最後に確認した場所"),
    hasInjuries: injured ? injured === "あり" : null,
    policeContacted: police ? police === "済み" : null,
    canDrive: drivable ? drivable === "可能" : null,
    counterpartInfo: reportField(message, "相手方情報（車種・ナンバー等）"),
    symptom: reportField(message, "症状"),
  };
}

// 契約へのアクセス権チェック
async function canAccessContract(userId: number, userRole: string, contractId: number): Promise<boolean> {
  if (userRole === "admin") return true;

  if (userRole === "rental_company") {
    // 自社の車両に紐づく契約かチェック
    const raw = await db.execute(sql`
      SELECT vc.id FROM van_contracts vc
      JOIN vehicles v ON vc.vehicle_id = v.id
      JOIN users u ON u.rental_company_id = v.rental_company_id
      WHERE vc.id = ${contractId} AND u.id = ${userId}
      LIMIT 1
    `);
    return !!toRow(raw);
  }

  // 一般ユーザー：自分の契約かチェック
  const raw = await db.execute(sql`
    SELECT id FROM van_contracts WHERE id = ${contractId} AND user_id = ${userId} LIMIT 1
  `);
  return !!toRow(raw);
}

// ── GET /contract-chat/:contractId ─────────────────────────────────────────
router.get("/contract-chat/:contractId", requireAuth, async (req: Request, res: Response) => {
  try {
    const contractId = parseInt(String(req.params.contractId));
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    if (!Number.isInteger(contractId) || contractId <= 0) {
      return res.status(400).json({ error: "Invalid contract ID" });
    }

    if (userId === undefined) return res.status(401).json({ error: "Unauthorized" });
    if (!(await canAccessContract(userId, userRole ?? "", contractId))) {
      return res.status(403).json({ error: "アクセス権がありません" });
    }

    // メッセージ一覧
    const raw = await db.execute(sql`
      SELECT cm.*, u.name as sender_name, u.role as sender_role_actual
      FROM contract_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.contract_id = ${contractId}
      ORDER BY cm.created_at ASC
    `);
    const messages = toRows(raw);

    // 自分宛の未読を既読に
    await db.execute(sql`
      UPDATE contract_messages
      SET is_read = TRUE
      WHERE contract_id = ${contractId}
        AND sender_id != ${userId}
        AND is_read = FALSE
    `);

    return res.json(messages);
  } catch (err) {
    console.error("get contract chat error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /contract-chat/:contractId ────────────────────────────────────────
router.post("/contract-chat/:contractId", requireAuth, async (req: Request, res: Response) => {
  try {
    const contractId = parseInt(String(req.params.contractId));
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const { message } = req.body;

    if (!Number.isInteger(contractId) || contractId <= 0) {
      return res.status(400).json({ error: "Invalid contract ID" });
    }

    if (!message?.trim()) return res.status(400).json({ error: "メッセージを入力してください" });

    if (userId === undefined) return res.status(401).json({ error: "Unauthorized" });
    if (!(await canAccessContract(userId, userRole ?? "", contractId))) {
      return res.status(403).json({ error: "アクセス権がありません" });
    }

    // メッセージ保存
    const raw = await db.execute(sql`
      INSERT INTO contract_messages (contract_id, sender_id, sender_role, message)
      VALUES (${contractId}, ${userId}, ${userRole}, ${message.trim()})
      RETURNING *
    `);
    const saved = toRow(raw);
    const report = userRole === "user" ? parseIncidentReport(message.trim()) : null;
    if (report) {
      await db.insert(vanIncidentsTable).values({
        contractId,
        userId,
        incidentType: report.incidentType,
        status: "報告受付",
        description: message.trim(),
        location: report.location,
        hasInjuries: report.hasInjuries,
        policeContacted: report.policeContacted,
        canDrive: report.canDrive,
        counterpartInfo: report.counterpartInfo,
        symptom: report.symptom,
      });
    }

    // 送信者情報
    const [sender] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    // 相手に通知
    // ユーザーの場合 → 協力会社のユーザーとadminに通知
    // 協力会社の場合 → 契約ユーザーとadminに通知
    const contractRaw = await db.execute(sql`
      SELECT vc.user_id, v.rental_company_id
      FROM van_contracts vc
      LEFT JOIN vehicles v ON vc.vehicle_id = v.id
      WHERE vc.id = ${contractId}
    `);
    const contract = toRow(contractRaw) as any;

    const recipientIds = new Set<number>();

    if (userRole === "user") {
      // 協力会社アカウントとadminへ
      if (contract?.rental_company_id) {
        const companyUsersRaw = await db.execute(sql`
          SELECT id FROM users WHERE rental_company_id = ${contract.rental_company_id}
        `);
        toRows(companyUsersRaw).forEach((u: any) => recipientIds.add(u.id));
      }
    } else {
      // 契約ユーザーへ
      if (contract?.user_id) recipientIds.add(contract.user_id);
    }

    // adminには常に通知
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    admins.forEach(a => { if (a.id !== userId) recipientIds.add(a.id); });

    const roleLabel = userRole === "rental_company" ? "協力会社" : userRole === "admin" ? "管理者" : "ユーザー";
    for (const rid of recipientIds) {
      if (rid === userId) continue;
      await db.insert(notificationsTable).values({
        userId: rid,
        title: `💬 契約チャット（#${contractId}）`,
        message: `${sender?.name ?? roleLabel}：${message.trim().slice(0, 50)}${message.trim().length > 50 ? '…' : ''}`,
      });
    }

    return res.status(201).json(saved);
  } catch (err) {
    console.error("post contract chat error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /contract-chat/:contractId/unread ──────────────────────────────────
// 自分宛の未読件数を取得
router.get("/contract-chat/:contractId/unread", requireAuth, async (req: Request, res: Response) => {
  try {
    const contractId = parseInt(String(req.params.contractId));
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    if (!Number.isInteger(contractId) || contractId <= 0) {
      return res.status(400).json({ error: "Invalid contract ID" });
    }

    if (userId === undefined) return res.status(401).json({ error: "Unauthorized" });
    if (!(await canAccessContract(userId, userRole ?? "", contractId))) {
      return res.status(403).json({ error: "アクセス権がありません" });
    }

    const raw = await db.execute(sql`
      SELECT COUNT(*) as count FROM contract_messages
      WHERE contract_id = ${contractId}
        AND sender_id != ${userId}
        AND is_read = FALSE
    `);
    const row = toRow(raw) as any;
    return res.json({ unread: Number(row?.count ?? 0) });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
