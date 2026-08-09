import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRentalCompany } from "../middlewares/auth";
import {
  vehiclesTable, vanContractsTable, usersTable,
  rentalCompaniesTable, notificationsTable,
} from "@workspace/db";

const router = Router();

function toRows(raw: unknown): unknown[] {
  return (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
}
function toRow(raw: unknown): unknown | null {
  return toRows(raw)[0] ?? null;
}

// 自分に紐付いた rental_company_id を取得するヘルパー
async function getMyCompanyId(userId: number): Promise<number | null> {
  const raw = await db.execute(sql`SELECT rental_company_id FROM users WHERE id = ${userId}`);
  return (toRow(raw) as any)?.rental_company_id ?? null;
}

// ── GET /company/me ─────────────────────────────────────────────────────────
router.get("/company/me", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const raw = await db.execute(sql`
      SELECT u.id, u.email, u.name, u.phone, u.role, u.rental_company_id,
        rc.name as company_name, rc.contact_name, rc.phone as company_phone,
        rc.address, rc.service_areas, rc.notes
      FROM users u
      LEFT JOIN rental_companies rc ON rc.id = u.rental_company_id
      WHERE u.id = ${userId}
    `);
    const user = toRow(raw);
    if (!user) return res.status(404).json({ error: "Not found" });
    return res.json(user);
  } catch (err) {
    console.error("company me error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/dashboard ──────────────────────────────────────────────────
router.get("/company/dashboard", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const rcId = userRole === "admin" ? null : await getMyCompanyId(userId);
    if (!rcId && userRole !== "admin") return res.status(403).json({ error: "会社が紐付けられていません" });

    const statsRaw = rcId
      ? await db.execute(sql`
          SELECT
            COUNT(DISTINCT v.id) as total_vehicles,
            COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'available') as available_vehicles,
            COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'rented') as rented_vehicles,
            COUNT(DISTINCT vc.id) FILTER (WHERE vc.status = 'active') as active_contracts,
            COUNT(DISTINCT vc.id) FILTER (WHERE vc.status = 'payment_issue') as payment_issues,
            COUNT(DISTINCT vc.id) FILTER (WHERE vc.status = 'return_pending') as return_pending
          FROM vehicles v
          LEFT JOIN van_contracts vc ON vc.vehicle_id = v.id
          WHERE v.rental_company_id = ${rcId}
        `)
      : await db.execute(sql`
          SELECT
            COUNT(DISTINCT v.id) as total_vehicles,
            COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'available') as available_vehicles,
            COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'rented') as rented_vehicles,
            COUNT(DISTINCT vc.id) FILTER (WHERE vc.status = 'active') as active_contracts,
            COUNT(DISTINCT vc.id) FILTER (WHERE vc.status = 'payment_issue') as payment_issues,
            COUNT(DISTINCT vc.id) FILTER (WHERE vc.status = 'return_pending') as return_pending
          FROM vehicles v
          LEFT JOIN van_contracts vc ON vc.vehicle_id = v.id
        `);
    const stats = toRow(statsRaw) ?? {};

    // 直近5件の契約
    const recentRaw = rcId
      ? await db.execute(sql`
          SELECT vc.id, vc.status, vc.created_at, u.name as user_name, v.maker, v.model
          FROM van_contracts vc
          LEFT JOIN users u ON vc.user_id = u.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          WHERE v.rental_company_id = ${rcId}
          ORDER BY vc.created_at DESC LIMIT 5
        `)
      : await db.execute(sql`
          SELECT vc.id, vc.status, vc.created_at, u.name as user_name, v.maker, v.model
          FROM van_contracts vc
          LEFT JOIN users u ON vc.user_id = u.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          ORDER BY vc.created_at DESC LIMIT 5
        `);

    return res.json({ stats, recentContracts: toRows(recentRaw) });
  } catch (err) {
    console.error("company dashboard error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// rcId を解決するヘルパー（admin は null = 全件）
async function resolveRcId(userId: number, userRole: string): Promise<number | null> {
  if (userRole === "admin") return null;
  return getMyCompanyId(userId);
}

// ── GET /company/vehicles ───────────────────────────────────────────────────
router.get("/company/vehicles", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await resolveRcId(req.session.userId, req.session.userRole);
    const raw = rcId
      ? await db.execute(sql`SELECT * FROM vehicles WHERE rental_company_id = ${rcId} ORDER BY created_at DESC`)
      : await db.execute(sql`SELECT * FROM vehicles ORDER BY created_at DESC`);
    return res.json(toRows(raw));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/company/vehicles/:id", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const rcId = await resolveRcId(userId, userRole);

    if (rcId !== null) {
      const [vehicle] = await db.select({ rentalCompanyId: vehiclesTable.rentalCompanyId })
        .from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
      if (!vehicle || vehicle.rentalCompanyId !== rcId) {
        return res.status(403).json({ error: "権限がありません" });
      }
    }

    const { notes, monthlyPrice, prefecture, features } = req.body;
    const [updated] = await db.update(vehiclesTable).set({
      notes, monthlyPrice, prefecture, features, updatedAt: new Date(),
    }).where(eq(vehiclesTable.id, id)).returning();
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/contracts ──────────────────────────────────────────────────
router.get("/company/contracts", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await resolveRcId(req.session.userId, req.session.userRole);
    const raw = rcId
      ? await db.execute(sql`
          SELECT vc.*, u.name as user_name, u.phone as user_phone, u.email as user_email,
            v.maker, v.model, v.license_plate, v.prefecture
          FROM van_contracts vc
          LEFT JOIN users u ON vc.user_id = u.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          WHERE v.rental_company_id = ${rcId}
          ORDER BY vc.created_at DESC
        `)
      : await db.execute(sql`
          SELECT vc.*, u.name as user_name, u.phone as user_phone, u.email as user_email,
            v.maker, v.model, v.license_plate, v.prefecture
          FROM van_contracts vc
          LEFT JOIN users u ON vc.user_id = u.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          ORDER BY vc.created_at DESC
        `);
    return res.json(toRows(raw));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/insurance ──────────────────────────────────────────────────
router.get("/company/insurance", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await resolveRcId(req.session.userId, req.session.userRole);
    const raw = rcId
      ? await db.execute(sql`
          SELECT ip.*, v.maker, v.model, v.license_plate
          FROM insurance_policies ip
          LEFT JOIN vehicles v ON ip.vehicle_id = v.id
          WHERE v.rental_company_id = ${rcId}
          ORDER BY ip.expiry_date ASC
        `)
      : await db.execute(sql`
          SELECT ip.*, v.maker, v.model, v.license_plate
          FROM insurance_policies ip
          LEFT JOIN vehicles v ON ip.vehicle_id = v.id
          ORDER BY ip.expiry_date ASC
        `);
    return res.json(toRows(raw));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/gps ────────────────────────────────────────────────────────
router.get("/company/gps", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await resolveRcId(req.session.userId, req.session.userRole);
    const raw = rcId
      ? await db.execute(sql`
          SELECT gd.*, v.maker, v.model, v.license_plate,
            (SELECT row_to_json(gl) FROM gps_locations gl
             WHERE gl.gps_device_id = gd.id ORDER BY gl.recorded_at DESC LIMIT 1) as last_location
          FROM gps_devices gd
          JOIN vehicles v ON gd.vehicle_id = v.id
          WHERE v.rental_company_id = ${rcId}
          ORDER BY gd.created_at DESC
        `)
      : await db.execute(sql`
          SELECT gd.*, v.maker, v.model, v.license_plate,
            (SELECT row_to_json(gl) FROM gps_locations gl
             WHERE gl.gps_device_id = gd.id ORDER BY gl.recorded_at DESC LIMIT 1) as last_location
          FROM gps_devices gd
          JOIN vehicles v ON gd.vehicle_id = v.id
          ORDER BY gd.created_at DESC
        `);
    return res.json(toRows(raw));
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /company/notify-admin ───────────────────────────────────────────────
// 協力会社 → Admin への問い合わせ通知
router.post("/company/notify-admin", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const { message } = req.body;
    const rawUser = await db.execute(sql`SELECT name, rental_company_id FROM users WHERE id = ${userId}`);
    const user = toRow(rawUser) as any;

    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: `📩 協力会社からの問い合わせ`,
        message: `${user?.name ?? ''}：${message}`,
      });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
