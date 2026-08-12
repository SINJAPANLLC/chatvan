import { Router, type IRouter } from "express";
import { db, userActivityLogsTable, usersTable } from "@workspace/db";
import { eq, desc, and, gte, lte, like, or, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import type { Request, Response } from "express";

const router: IRouter = Router();

// GET /admin/user-logs?page=1&limit=50&search=&action=&dateFrom=&dateTo=
router.get("/admin/user-logs", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const page    = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
  const limit   = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset  = (page - 1) * limit;
  const search  = String(req.query.search ?? "").trim();
  const action  = String(req.query.action ?? "").trim();
  const dateFrom = String(req.query.dateFrom ?? "").trim();
  const dateTo   = String(req.query.dateTo   ?? "").trim();

  const conditions: any[] = [];

  if (search) {
    conditions.push(
      or(
        like(userActivityLogsTable.userName,  `%${search}%`),
        like(userActivityLogsTable.userEmail, `%${search}%`),
      )
    );
  }
  if (action) {
    conditions.push(eq(userActivityLogsTable.action, action));
  }
  if (dateFrom) {
    conditions.push(gte(userActivityLogsTable.createdAt, new Date(`${dateFrom}T00:00:00+09:00`)));
  }
  if (dateTo) {
    conditions.push(lte(userActivityLogsTable.createdAt, new Date(`${dateTo}T23:59:59+09:00`)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, countRows] = await Promise.all([
    db.select().from(userActivityLogsTable)
      .where(where)
      .orderBy(desc(userActivityLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(userActivityLogsTable).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  res.json({
    logs: logs.map(l => ({
      ...l,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

export default router;
