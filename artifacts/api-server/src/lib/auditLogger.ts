import type { Request } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type AuditPayload = {
  action: string;
  targetType: string;
  targetId?: string | number | null;
  beforeData?: unknown;
  afterData?: unknown;
};

function serialize(data: unknown): string | null {
  if (data === undefined || data === null) return null;
  try {
    const value = JSON.stringify(data);
    return value.length > 10_000 ? `${value.slice(0, 9_997)}...` : value;
  } catch {
    return JSON.stringify({ unavailable: true });
  }
}

function requestIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip ?? null;
}

/**
 * 管理者操作だけをサーバー側の認証情報から監査記録する。
 * 監査失敗は主処理を止めず、必ずサーバーログに残す。
 */
export async function logAdminAudit(req: Request, payload: AuditPayload): Promise<void> {
  try {
    const actorId = (req.session as any)?.userId ?? (req as any).user?.id;
    if (!Number.isInteger(actorId)) {
      console.warn("[audit] skipped: authenticated administrator id was unavailable");
      return;
    }

    const [actor] = await db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, actorId))
      .limit(1);

    await db.insert(auditLogsTable).values({
      actorId,
      actorType: "admin",
      actorName: actor?.name?.trim() || actor?.email || `管理者 #${actorId}`,
      action: payload.action,
      targetType: payload.targetType,
      targetId: payload.targetId == null ? null : String(payload.targetId),
      beforeData: serialize(payload.beforeData),
      afterData: serialize(payload.afterData),
      ipAddress: requestIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (error) {
    console.warn("[audit] failed to write log:", error);
  }
}