import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth, requireRentalCompany } from "../middlewares/auth";
import {
  vehiclesTable, vanContractsTable, usersTable,
  rentalCompaniesTable, notificationsTable, settlementsTable,
} from "@workspace/db";
import { notifyAdmins } from "../lib/notifyHelpers";

const router = Router();

function toRows(raw: unknown): unknown[] {
  return (raw as any)?.rows ?? (Array.isArray(raw) ? raw : []);
}
function toRow(raw: unknown): unknown | null {
  return toRows(raw)[0] ?? null;
}

class CompanyAccountEmailConflictError extends Error {}

// 自分に紐付いた rental_company_id を取得するヘルパー
// rental_company_id が NULL の場合はメール照合でフォールバック修正する
async function getMyCompanyId(userId: number): Promise<number | null> {
  const raw = await db.execute(sql`SELECT rental_company_id, email FROM users WHERE id = ${userId}`);
  const user = toRow(raw) as any;
  if (!user) return null;
  if (user.rental_company_id) return Number(user.rental_company_id);

  // フォールバック: 正規化したメールが一社だけ一致する場合のみ自動修正する。
  // 同じメールを複数社が使っている曖昧なデータは、勝手に紐付けない。
  if (user.email) {
    const rcRaw = await db.execute(sql`
      SELECT id
      FROM rental_companies
      WHERE LOWER(BTRIM(email)) = LOWER(BTRIM(${user.email}))
      ORDER BY id
      LIMIT 2
    `);
    const matchingCompanies = toRows(rcRaw) as any[];
    if (matchingCompanies.length === 1 && matchingCompanies[0]?.id) {
      await db.execute(sql`UPDATE users SET rental_company_id = ${matchingCompanies[0].id} WHERE id = ${userId}`);
      return Number(matchingCompanies[0].id);
    }
  }
  return null;
}

// ── GET /company/me ─────────────────────────────────────────────────────────
router.get("/company/me", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const companyId = await getMyCompanyId(userId);
    if (!companyId) return res.status(403).json({ error: "会社が紐付けられていません" });
    const raw = await db.execute(sql`
      SELECT u.id, u.email, u.name, u.company_name AS user_company_name, u.phone, u.role, u.rental_company_id,
        rc.name as company_name, rc.corporate_name, rc.contact_name, rc.phone as company_phone,
        rc.email as company_email, rc.address, rc.service_areas, rc.notes,
        rc.fleet_size, rc.status, rc.business_hours, rc.bank_information, rc.payment_info
      FROM users u
      LEFT JOIN rental_companies rc ON rc.id = u.rental_company_id
      WHERE u.id = ${userId} AND rc.id = ${companyId}
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
    const userId = req.session.userId!;
    const userRole = req.session.userRole!;
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
  // admin でも rental_company_id が設定されていれば自社フィルタを適用する
  const companyId = await getMyCompanyId(userId);
  if (companyId) return companyId;
  if (userRole === "admin") return null; // 全社データを見る純粋 admin
  return null;
}

// ── GET /company/vehicles ───────────────────────────────────────────────────
router.get("/company/vehicles", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await resolveRcId(req.session.userId!, req.session.userRole!);
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
    const userId = req.session.userId!;
    const userRole = req.session.userRole!;
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
    const rcId = await resolveRcId(req.session.userId!, req.session.userRole!);
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
            va.id as application_id, va.status as application_status,
            rc.address as rental_company_address
          FROM van_contracts vc
          LEFT JOIN users u ON vc.user_id = u.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          LEFT JOIN rental_companies rc ON rc.id = COALESCE(v.rental_company_id, vc.rental_company_id)
          LEFT JOIN van_applications va ON vc.application_id = va.id
          WHERE COALESCE(v.rental_company_id, vc.rental_company_id) = ${rcId}
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
            va.id as application_id, va.status as application_status,
            rc.address as rental_company_address
          FROM van_contracts vc
          LEFT JOIN users u ON vc.user_id = u.id
          LEFT JOIN vehicles v ON vc.vehicle_id = v.id
          LEFT JOIN rental_companies rc ON rc.id = COALESCE(v.rental_company_id, vc.rental_company_id)
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
    const rcId = await resolveRcId(req.session.userId!, req.session.userRole!);
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
    const rcId = await resolveRcId(req.session.userId!, req.session.userRole!);
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
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!companyName || !contactName || !phone || !normalizedEmail) {
      return res.status(400).json({ error: "会社名・担当者名・電話番号・メールアドレスは必須です" });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "パスワードは6文字以上で入力してください" });
    }
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(String(password), 10);
    const parsedFleetSize = fleetSize === undefined || fleetSize === null || fleetSize === ""
      ? null
      : Number.parseInt(String(fleetSize), 10);

    // 会社と代表ログインアカウントは、片方だけ残らないよう同じトランザクションで作成する。
    const company = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: usersTable.id }).from(usersTable)
        .where(sql`LOWER(BTRIM(${usersTable.email})) = ${normalizedEmail}`).limit(1);
      if (existing.length > 0) throw new CompanyAccountEmailConflictError();

      const [createdCompany] = await tx.insert(rentalCompaniesTable).values({
        name: String(companyName).trim(),
        corporateName: corporateName?.trim() || null,
        contactName: String(contactName).trim(),
        phone: String(phone).trim(),
        email: normalizedEmail,
        address: address?.trim() || null,
        serviceAreas: serviceAreas?.trim() || null,
        fleetSize: Number.isFinite(parsedFleetSize) ? parsedFleetSize : null,
        notes: notes?.trim() || null,
        status: "prospect",
      } as any).returning();

      await tx.insert(usersTable).values({
        email: normalizedEmail,
        passwordHash,
        name: String(contactName).trim(),
        companyName: String(companyName).trim(),
        phone: String(phone).trim(),
        role: "rental_company",
        rentalCompanyId: createdCompany.id,
      } as any);
      return createdCompany;
    });

    // 管理者通知
    await notifyAdmins("協力会社登録申請", `${companyName} から登録申請が届きました`);
    return res.json({ ok: true, id: company.id });
  } catch (err) {
    if (err instanceof CompanyAccountEmailConflictError) {
      return res.status(409).json({ error: "このメールアドレスは既に登録されています" });
    }
    req.log.error({ err }, "company/register error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /company/vehicles ── 協力会社が車両を登録申請 ──────────────────────
router.post("/company/vehicles", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await getMyCompanyId(req.session.userId!);
    if (!rcId) {
      const isAdmin = req.session.userRole === "admin";
      return res.status(403).json({
        error: isAdmin
          ? "管理者アカウントでは車両登録できません。協力会社アカウントでログインしてください。"
          : "アカウントに会社が紐付けられていません。管理者にお問い合わせください。",
      });
    }
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
    await notifyAdmins("車両登録申請", `${b.maker} ${b.model} の登録申請が届きました（会社ID: ${rcId}）`);
    return res.json(vehicle);
  } catch (err) {
    console.error("company/vehicles POST error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/settlements ── 支払い明細（invoices ベース）──────────────────
router.get("/company/settlements", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await resolveRcId(req.session.userId!, req.session.userRole!);
    if (!rcId && req.session.userRole !== "admin") return res.json([]);

    // 全アクティブ契約を月ごとに展開し、invoiceがあれば紐づける
    const buildQuery = (rcFilter: any) => sql`
      SELECT
        ('c' || vc.id || '-' || to_char(gs.month, 'YYYYMM')) AS id,
        to_char(gs.month, 'YYYY-MM')       AS period_month,
        vc.monthly_price                   AS user_payment_amount,
        vc.sin_japan_fee                   AS chat_van_fee,
        vc.monthly_price                   AS rental_company_amount,
        -- 黒ナンバー取得費（初月かつ申請あり → 固定1万円）
        CASE WHEN date_trunc('month', gs.month) = date_trunc('month', vc.start_date::date)
             AND vc.black_number_requested = true
          THEN 10000 ELSE 0 END AS black_number_fee,
        CASE
          WHEN vc.payment_method = 'card'  THEN 'completed'
          WHEN i.status = 'paid'           THEN 'completed'
          WHEN i.id IS NOT NULL            THEN i.status
          ELSE 'pending'
        END                                AS status,
        COALESCE(i.due_date::text, NULL)   AS scheduled_date,
        i.invoice_number,
        vc.contract_number,
        vc.monthly_price,
        v.maker, v.model, v.license_plate,
        u.name                             AS user_name,
        COALESCE(vc.payment_method, 'invoice')::text AS payment_method
      FROM van_contracts vc
      JOIN vehicles v  ON vc.vehicle_id = v.id
      JOIN users u     ON vc.user_id    = u.id
      JOIN LATERAL generate_series(
        date_trunc('month', vc.start_date::date),
        date_trunc('month', COALESCE(vc.end_date::date, CURRENT_DATE)),
        '1 month'::interval
      ) AS gs(month) ON true
      LEFT JOIN LATERAL (
        SELECT id, status, due_date, invoice_number
        FROM invoices
        WHERE user_id = vc.user_id
          AND period_start::date >= gs.month::date
          AND period_start::date <  (gs.month + interval '1 month')::date
        ORDER BY id DESC
        LIMIT 1
      ) i ON true
      WHERE vc.status IN ('active', 'completed')
        AND vc.payment_method IS NOT NULL
        AND ${rcFilter}
      ORDER BY period_month DESC, vc.id
    `;
    const raw = rcId
      ? await db.execute(buildQuery(sql`v.rental_company_id = ${rcId}`))
      : await db.execute(buildQuery(sql`true`));
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
    const rcId = await resolveRcId(req.session.userId!, req.session.userRole!);
    // 自社契約かチェック
    const contractCheck = await db.execute(sql`
      SELECT vc.id FROM van_contracts vc
      JOIN vehicles v ON vc.vehicle_id = v.id
      WHERE vc.id = ${contractId}
        AND (${rcId}::int IS NULL OR v.rental_company_id = ${rcId})
      LIMIT 1
    `);
    if (!toRow(contractCheck)) return res.json([]);
    // 正式な事故記録を優先し、移行前の定型チャット報告も漏れなく表示する。
    // 同じ本文が正式記録として保存済みの場合は、チャット側を重複表示しない。
    const raw = await db.execute(sql`
      WITH incident_records AS (
        SELECT
          'incident-' || vi.id AS id,
          CASE
            WHEN vi.description LIKE '【%' THEN vi.description
            WHEN vi.incident_type::text = 'accident' THEN '【交通事故】' || E'\n' || COALESCE(vi.description, '')
            WHEN vi.incident_type::text = 'breakdown' THEN '【車両故障】' || E'\n' || COALESCE(vi.description, '')
            ELSE '【その他トラブル】' || E'\n' || COALESCE(vi.description, '')
          END AS message,
          vi.created_at,
          u.name AS user_name
        FROM van_incidents vi
        LEFT JOIN users u ON vi.user_id = u.id
        WHERE vi.contract_id = ${contractId}
      ),
      legacy_messages AS (
        SELECT
          'message-' || cm.id AS id,
          cm.message,
          cm.created_at,
          u.name AS user_name
        FROM contract_messages cm
        LEFT JOIN users u ON cm.sender_id = u.id
        WHERE cm.contract_id = ${contractId}
          AND (
            cm.message LIKE '【交通事故】%'
            OR cm.message LIKE '【車両故障】%'
            OR cm.message LIKE '【盗難・不正使用】%'
            OR cm.message LIKE '【その他トラブル】%'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM van_incidents vi
            WHERE vi.contract_id = cm.contract_id
              AND vi.user_id = cm.sender_id
              AND vi.description = cm.message
          )
      )
      SELECT * FROM incident_records
      UNION ALL
      SELECT * FROM legacy_messages
      ORDER BY created_at DESC
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
      SELECT id, title, message, read_status as read, created_at
      FROM notifications
      WHERE user_id = ${req.session.userId!}
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
    await db.execute(sql`UPDATE notifications SET read_status = true WHERE id = ${id} AND user_id = ${req.session.userId!}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /company/notifications/read-all ────────────────────────────────────
router.patch("/company/notifications/read-all", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE notifications SET read_status = true WHERE user_id = ${req.session.userId!}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /company/settings ── 会社プロフィール取得 ────────────────────────────
router.get("/company/settings", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const rcId = await getMyCompanyId(req.session.userId!);
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
    const rcId = await getMyCompanyId(req.session.userId!);
    if (!rcId) return res.status(403).json({ error: "会社が紐付けられていません" });
    const { name, corporateName, contactName, phone, email, address, serviceAreas, fleetSize, notes,
            businessHours,
            bankName, bankBranch, bankType, bankAccount, bankHolder } = req.body;
    if (email !== undefined && !String(email).trim()) {
      return res.status(400).json({ error: "メールアドレスは必須です" });
    }

    // 既存の銀行情報を取得してマージ
    const existingRow = await db.execute(sql`SELECT bank_information FROM rental_companies WHERE id = ${rcId} LIMIT 1`);
    const existing = ((existingRow as any)?.rows ?? existingRow)[0];
    let existingBank: Record<string, string> = {};
    try { existingBank = existing?.bank_information ? JSON.parse(existing.bank_information) : {}; } catch {}
    const bankInfo = {
      ...existingBank,
      ...(bankName    !== undefined ? { bankName }    : {}),
      ...(bankBranch  !== undefined ? { bankBranch }  : {}),
      ...(bankType    !== undefined ? { bankType }    : {}),
      ...(bankAccount !== undefined ? { bankAccount } : {}),
      ...(bankHolder  !== undefined ? { bankHolder }  : {}),
    };

    const [currentCompany] = await db.select().from(rentalCompaniesTable)
      .where(eq(rentalCompaniesTable.id, rcId)).limit(1);
    if (!currentCompany) return res.status(404).json({ error: "会社が見つかりません" });

    const updated = await db.transaction(async (tx) => {
      const currentCompanyEmail = currentCompany.email?.trim().toLowerCase() || "";
      const nextEmail = email === undefined ? currentCompanyEmail : String(email).trim().toLowerCase();
      const [nextCompany] = await tx.update(rentalCompaniesTable).set({
        ...(name ? { name: String(name).trim() } : {}),
        ...(corporateName !== undefined ? { corporateName: corporateName?.trim() || null } : {}),
        ...(contactName ? { contactName: String(contactName).trim() } : {}),
        ...(phone ? { phone: String(phone).trim() } : {}),
        ...(email !== undefined ? { email: nextEmail || null } : {}),
        ...(address !== undefined ? { address: address?.trim() || null } : {}),
        ...(serviceAreas !== undefined ? { serviceAreas: serviceAreas?.trim() || null } : {}),
        ...(fleetSize !== undefined ? { fleetSize: fleetSize === "" || fleetSize === null ? null : parseInt(String(fleetSize), 10) } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(businessHours !== undefined ? { businessHours: businessHours?.trim() || null } : {}),
        bankInformation: JSON.stringify(bankInfo),
        updatedAt: new Date(),
      } as any).where(eq(rentalCompaniesTable.id, rcId)).returning();

      // 全ての会社アカウントには会社名を反映し、代表アカウントには連絡先も同期する。
      await tx.update(usersTable).set({ companyName: nextCompany.name })
        .where(and(eq(usersTable.rentalCompanyId, rcId), eq(usersTable.role, "rental_company")));

      if (currentCompanyEmail) {
        const [primaryUser] = await tx.select({ id: usersTable.id, email: usersTable.email })
          .from(usersTable)
          .where(and(
            eq(usersTable.rentalCompanyId, rcId),
            eq(usersTable.role, "rental_company"),
            sql`LOWER(BTRIM(${usersTable.email})) = ${currentCompanyEmail}`,
          ))
          .limit(1);

        if (primaryUser) {
          if (nextCompany.email && nextCompany.email !== primaryUser.email) {
            const [emailOwner] = await tx.select({ id: usersTable.id }).from(usersTable)
              .where(sql`LOWER(BTRIM(${usersTable.email})) = ${nextCompany.email}`).limit(1);
            if (emailOwner && emailOwner.id !== primaryUser.id) throw new CompanyAccountEmailConflictError();
          }
          await tx.update(usersTable).set({
            name: nextCompany.contactName || primaryUser.email,
            companyName: nextCompany.name,
            phone: nextCompany.phone || null,
            ...(nextCompany.email ? { email: nextCompany.email } : {}),
          }).where(eq(usersTable.id, primaryUser.id));
        }
      }
      return nextCompany;
    });
    return res.json(updated);
  } catch (err) {
    if (err instanceof CompanyAccountEmailConflictError) {
      return res.status(409).json({ error: "このメールアドレスは別のアカウントで使用されています" });
    }
    req.log.error({ err }, "company/settings PATCH error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /company/notify-admin ───────────────────────────────────────────────
// 協力会社 → Admin への問い合わせ通知
router.post("/company/notify-admin", requireAuth, requireRentalCompany, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { message } = req.body;
    const rawUser = await db.execute(sql`SELECT name, rental_company_id FROM users WHERE id = ${userId}`);
    const user = toRow(rawUser) as any;

    await notifyAdmins(`📩 協力会社からの問い合わせ`, `${user?.name ?? ''}：${message}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
