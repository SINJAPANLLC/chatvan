import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { deleteUserAccount, UserDeletionError } from "../lib/userDeletion";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatUser(u: any) {
  const { passwordHash: _ph, ...safe } = u;
  return {
    ...safe,
    createdAt: safe.createdAt instanceof Date ? safe.createdAt.toISOString() : safe.createdAt,
  };
}

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(formatUser));
});

router.get("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "ユーザーが見つかりません" }); return; }
  res.json(formatUser(user));
});

router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const allowed = ['name', 'email', 'companyName', 'phone', 'role', 'billingAddress',
    'creditStatus', 'creditLimit', 'paymentTerms', 'preferredPaymentMethod', 'isCompany', 'corporateNumber'];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "ユーザーが見つかりません" }); return; }
  res.json(formatUser(updated));
});

router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "無効なID" }); return; }

  const actorUserId = req.session.userId;
  if (!actorUserId) {
    res.status(401).json({ error: "認証が必要です" });
    return;
  }

  try {
    await deleteUserAccount(id, actorUserId);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof UserDeletionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    req.log.error(
      { err: error, userId: id },
      "Failed to delete user account and related records",
    );
    res.status(500).json({ error: "ユーザーの削除に失敗しました。" });
  }
});

export default router;
