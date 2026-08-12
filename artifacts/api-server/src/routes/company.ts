import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRentalCompany } from "../middlewares/auth";
import {
  vehiclesTable, vanContractsTable, usersTable,
  rentalCompaniesTable, notificationsTable, settlementsTable,
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
    if (!rcId && req.session.userRole !== "admin") return res.json([]);
    const rows = rcId
      ? await db.select().from(vehiclesTable).where(eq(vehiclesTable.rentalCompanyId, rcId)).orderBy(sql`created_at DESC`)
      : await db.select().from(vehiclesTable).orderBy(sql`created_at DESC`);
    return res.json(rows);
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

    const b = req.body;
    const pick = (v: any) => v !== undefined ? v : undefined;
    const [updated] = await db.update(vehiclesTable).set(Object.fromEntries(Object.entries({
      updatedAt: new Date(),
      maker:                     pick(b.maker),
      model:                     pick(b.model),
      grade:                     pick(b.grade),
      year:                      b.year !== undefined ? (b.year ? parseInt(String(b.year)) : null) : undefined,
      color:                     pick(b.color),
      vin:                       pick(b.vin),
      licensePlate:              pick(b.licensePlate),
      transmission:              pick(b.transmission),
      fuelType:                  pick(b.fuelType),
      engineDisplacement:        pick(b.engineDisplacement),
      smokingPolicy:             pick(b.smokingPolicy),
      mileage:                   b.mileage !== undefined ? (b.mileage ? parseInt(String(b.mileage)) : null) : undefined,
      inspectionExpiry:          pick(b.inspectionExpiry),
      compulsoryInsuranceExpiry: pick(b.compulsoryInsuranceExpiry),
      inspectionCertificateOwner: pick(b.inspectionCertificateOwner),
      inspectionCertificateUser:  pick(b.inspectionCertificateUser),
      insuranceCompany:          pick(b.insuranceCompany),
      insurancePolicyNumber:     pick(b.insurancePolicyNumber),
      insuranceContact:          pick(b.insuranceContact),
      insuranceExpiry:           pick(b.insuranceExpiry),
      prefecture:                pick(b.prefecture),
      locationDetail:            pick(b.locationDetail),
      monthlyPrice:              b.monthlyPrice !== undefined ? String(b.monthlyPrice) : undefined,
      minPeriodMonths:           b.minPeriodMonths !== undefined ? parseInt(String(b.minPeriodMonths)) : undefined,
      availableFrom:             pick(b.availableFrom),
      hasEtc:                    b.hasEtc !== undefined ? !!b.hasEtc : undefined,
      hasDashcam:                b.hasDashcam !== undefined ? !!b.hasDashcam : undefined,
      hasBackupCam:              b.hasBackupCam !== undefined ? !!b.hasBackupCam : undefined,
      notes:                     pick(b.notes),
      photos:                    pick(b.photos),
      shakenCertPath:            pick(b.shakenCertPath),
      kensakushoCertPath:        pick(b.kensakushoCertPath),
      jibaisekiCertPath:         pick(b.jibaisekiCertPath),
      ninniHokenCertPath:        pick(b.ninniHokenCertPath),
    }).filter(([, v]) => v !== undefined)) as any).where(eq(vehiclesTable.id, id)).returning();
    return res.json(updated);
  } catch (err) {
    console.error("company/vehicles PATCH error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/contracts ──────────────────────────────────────────────────
router.get("/company/contracts", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await resolveRcId(req.session.userId, req.session.userRole);
    if (!rcId && req.session.userRole !== "admin") return res.json([]);
    const raw = rcId
      ? await db.execute(sql`
          SELECT vc.*, u.name as user_name, u.phone as user_phone, u.email as user_email,
            v.maker, v.model, v.license_plate, v.prefecture,
            v.year, v.mileage, v.inspection_expiry, v.has_etc, v.has_dashcam, v.has_backup_cam,
            v.photos as vehicle_photos, v.vin, v.grade, v.smoking_policy,
            v.insurance_company, v.insurance_expiry, v.compulsory_insurance_expiry,
            v.mileage_limit, v.excess_mileage_fee,
            v.color, v.engine_displacement, v.fuel_type, v.transmission,
            v.black_number_status, v.max_period_months,
            v.shaken_cert_path, v.kensakusho_cert_path,
            v.jibaiseki_cert_path, v.ninni_hoken_cert_path,
            va.id as application_id, va.status as application_status
          FROM van_contracts vc
          LEFT JOIN users u ON vc.user_id = u.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          LEFT JOIN van_applications va ON vc.application_id = va.id
          WHERE v.rental_company_id = ${rcId}
          ORDER BY vc.created_at DESC
        `)
      : await db.execute(sql`
          SELECT vc.*, u.name as user_name, u.phone as user_phone, u.email as user_email,
            v.maker, v.model, v.license_plate, v.prefecture,
            v.year, v.mileage, v.inspection_expiry, v.has_etc, v.has_dashcam, v.has_backup_cam,
            v.photos as vehicle_photos, v.vin, v.grade, v.smoking_policy,
            v.insurance_company, v.insurance_expiry, v.compulsory_insurance_expiry,
            v.mileage_limit, v.excess_mileage_fee,
            v.color, v.engine_displacement, v.fuel_type, v.transmission,
            v.black_number_status, v.max_period_months,
            v.shaken_cert_path, v.kensakusho_cert_path,
            v.jibaiseki_cert_path, v.ninni_hoken_cert_path,
            va.id as application_id, va.status as application_status
          FROM van_contracts vc
          LEFT JOIN users u ON vc.user_id = u.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          LEFT JOIN van_applications va ON vc.application_id = va.id
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
    if (!rcId && req.session.userRole !== "admin") return res.json([]);
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
    if (!rcId && req.session.userRole !== "admin") return res.json([]);
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

// ── POST /company/register ── 公開エンドポイント（認証不要）──────────────────
router.post("/company/register", async (req: Request, res: Response) => {
  try {
    const { companyName, corporateName, contactName, phone, email, password, address, serviceAreas, fleetSize, notes } = req.body;
    if (!companyName || !contactName || !phone || !email) {
      return res.status(400).json({ error: "会社名・担当者名・電話番号・メールアドレスは必須です" });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "パスワードは6文字以上で入力してください" });
    }
    // メール重複チェック
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "このメールアドレスは既に登録されています" });
    }
    // 会社レコード作成
    const [company] = await db.insert(rentalCompaniesTable).values({
      name: companyName,
      corporateName: corporateName || null,
      contactName,
      phone,
      email,
      address: address || null,
      serviceAreas: serviceAreas || null,
      fleetSize: fleetSize ? parseInt(String(fleetSize)) : null,
      notes: notes || null,
      status: "prospect",
    } as any).returning();
    // ユーザーアカウント作成
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(String(password), 10);
    await db.insert(usersTable).values({
      email,
      passwordHash,
      name: contactName,
      role: "rental_company",
      rentalCompanyId: company.id,
    } as any);
    // 管理者通知
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "協力会社登録申請",
        message: `${companyName} から登録申請が届きました`,
      });
    }
    return res.json({ ok: true, id: company.id });
  } catch (err) {
    console.error("company/register error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /company/vehicles ── 協力会社が車両を登録申請 ──────────────────────
router.post("/company/vehicles", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await getMyCompanyId(req.session.userId);
    if (!rcId) return res.status(403).json({ error: "会社が紐付けられていません" });
    const b = req.body;
    if (!b.maker || !b.model || !b.monthlyPrice) {
      return res.status(400).json({ error: "メーカー・モデル・月額料金は必須です" });
    }
    const [vehicle] = await db.insert(vehiclesTable).values({
      maker: b.maker,
      model: b.model,
      grade: b.grade || null,
      year: b.year ? parseInt(String(b.year)) : null,
      color: b.color || null,
      vin: b.vin || null,
      licensePlate: b.licensePlate || null,
      transmission: b.transmission || null,
      fuelType: b.fuelType || null,
      engineDisplacement: b.engineDisplacement || null,
      smokingPolicy: b.smokingPolicy || 'no_smoking',
      mileage: b.mileage ? parseInt(String(b.mileage)) : null,
      inspectionExpiry: b.inspectionExpiry || null,
      compulsoryInsuranceExpiry: b.compulsoryInsuranceExpiry || null,
      inspectionCertificateOwner: b.inspectionCertificateOwner || null,
      inspectionCertificateUser: b.inspectionCertificateUser || null,
      insuranceCompany: b.insuranceCompany || null,
      insurancePolicyNumber: b.insurancePolicyNumber || null,
      insuranceContact: b.insuranceContact || null,
      insuranceExpiry: b.insuranceExpiry || null,
      prefecture: b.prefecture || null,
      locationDetail: b.locationDetail || null,
      monthlyPrice: String(b.monthlyPrice),
      minPeriodMonths: b.minPeriodMonths ? parseInt(String(b.minPeriodMonths)) : 1,
      availableFrom: b.availableFrom || null,
      hasEtc: !!b.hasEtc,
      hasDashcam: !!b.hasDashcam,
      hasBackupCam: !!b.hasBackupCam,
      notes: b.notes || null,
      photos: b.photos || '[]',
      shakenCertPath: b.shakenCertPath || null,
      kensakushoCertPath: b.kensakushoCertPath || null,
      jibaisekiCertPath: b.jibaisekiCertPath || null,
      ninniHokenCertPath: b.ninniHokenCertPath || null,
      sinJapanFee: "0",
      rentalCompanyId: rcId,
      status: "reviewing",
    } as any).returning();
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    for (const admin of admins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        title: "車両登録申請",
        message: `${b.maker} ${b.model} の登録申請が届きました（会社ID: ${rcId}）`,
      });
    }
    return res.json(vehicle);
  } catch (err) {
    console.error("company/vehicles POST error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/settlements ── 支払い明細 ───────────────────────────────────
router.get("/company/settlements", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await resolveRcId(req.session.userId, req.session.userRole);
    if (!rcId && req.session.userRole !== "admin") return res.json([]);
    const raw = rcId
      ? await db.execute(sql`
          SELECT s.*, vc.contract_number, vc.monthly_price, v.maker, v.model, v.license_plate, u.name as user_name
          FROM settlements s
          LEFT JOIN van_contracts vc ON s.contract_id = vc.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          LEFT JOIN users u ON vc.user_id = u.id
          WHERE s.rental_company_id = ${rcId}
          ORDER BY s.period_month DESC
        `)
      : await db.execute(sql`
          SELECT s.*, vc.contract_number, vc.monthly_price, v.maker, v.model, v.license_plate, u.name as user_name
          FROM settlements s
          LEFT JOIN van_contracts vc ON s.contract_id = vc.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          LEFT JOIN users u ON vc.user_id = u.id
          ORDER BY s.period_month DESC
        `);
    return res.json(toRows(raw));
  } catch (err) {
    console.error("company/settlements error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/contracts/:id/incidents ── 契約の事故・故障報告メッセージ ──
router.get("/company/contracts/:id/incidents", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const contractId = Number(req.params.id);
    const rcId = await resolveRcId(req.session.userId, req.session.userRole);
    // 自社契約かチェック
    const contractCheck = await db.execute(sql`
      SELECT vc.id FROM van_contracts vc
      JOIN vehicles v ON vc.vehicle_id = v.id
      WHERE vc.id = ${contractId}
        AND (${rcId}::int IS NULL OR v.rental_company_id = ${rcId})
      LIMIT 1
    `);
    if (!toRow(contractCheck)) return res.json([]);
    // 事故・故障系のチャットメッセージを抽出
    const raw = await db.execute(sql`
      SELECT cm.id, cm.message, cm.created_at, u.name as user_name
      FROM contract_messages cm
      LEFT JOIN users u ON cm.sender_id = u.id
      WHERE cm.contract_id = ${contractId}
        AND cm.sender_role = 'user'
        AND (
          cm.message LIKE '【交通事故】%'
          OR cm.message LIKE '【車両故障】%'
          OR cm.message LIKE '【盗難・不正使用】%'
          OR cm.message LIKE '【その他トラブル】%'
        )
      ORDER BY cm.created_at DESC
    `);
    return res.json(toRows(raw));
  } catch (err) {
    console.error("company/contracts/:id/incidents error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/notifications ── ログインユーザーの通知一覧 ─────────────────
router.get("/company/notifications", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const raw = await db.execute(sql`
      SELECT id, title, message, read, created_at
      FROM notifications
      WHERE user_id = ${req.session.userId}
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return res.json(toRows(raw));
  } catch (err) {
    console.error("company/notifications error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /company/notifications/:id/read ────────────────────────────────────
router.patch("/company/notifications/:id/read", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.execute(sql`UPDATE notifications SET read = true WHERE id = ${id} AND user_id = ${req.session.userId}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /company/notifications/read-all ────────────────────────────────────
router.patch("/company/notifications/read-all", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE notifications SET read = true WHERE user_id = ${req.session.userId}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/settings ── 会社プロフィール取得 ────────────────────────────
router.get("/company/settings", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await getMyCompanyId(req.session.userId);
    if (!rcId) return res.status(403).json({ error: "会社が紐付けられていません" });
    const [company] = await db.select().from(rentalCompaniesTable).where(eq(rentalCompaniesTable.id, rcId));
    return company ? res.json(company) : res.status(404).json({ error: "Not found" });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /company/settings ── 会社プロフィール更新 ─────────────────────────
router.patch("/company/settings", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await getMyCompanyId(req.session.userId);
    if (!rcId) return res.status(403).json({ error: "会社が紐付けられていません" });
    const { name, corporateName, contactName, phone, email, address, serviceAreas, fleetSize, notes } = req.body;
    const [updated] = await db.update(rentalCompaniesTable).set({
      ...(name ? { name } : {}),
      ...(corporateName !== undefined ? { corporateName } : {}),
      ...(contactName ? { contactName } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(serviceAreas !== undefined ? { serviceAreas } : {}),
      ...(fleetSize !== undefined ? { fleetSize: fleetSize ? parseInt(String(fleetSize)) : null } : {}),
      ...(notes !== undefined ? { notes } : {}),
      updatedAt: new Date(),
    } as any).where(eq(rentalCompaniesTable.id, rcId)).returning();
    return res.json(updated);
  } catch (err) {
    console.error("company/settings PATCH error:", err);
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
