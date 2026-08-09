/**
 * Chat VAN full DB migration
 * - Creates new enum types (English)
 * - Adds new columns to existing tables
 * - Creates all new tables
 */
import { db } from "./index";
import { sql } from "drizzle-orm";

async function run() {
  console.log("▶ Starting full Chat VAN DB migration...");

  // ── Recreate enums with English values ───────────────────────────────────
  console.log("Creating new enum types...");

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE van_application_status AS ENUM(
        'new','hearing','vehicle_search','proposal_ready','proposed',
        'application_received','screening','approved','contracting',
        'payment_pending','delivery_pending','active','payment_issue',
        'return_pending','completed','cancelled','rejected'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    ALTER TABLE van_applications
      ALTER COLUMN status TYPE van_application_status
      USING status::van_application_status
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE vehicle_status AS ENUM(
        'draft','reviewing','available','proposed','reserved',
        'rented','return_pending','maintenance','suspended','unavailable'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    ALTER TABLE vehicles
      ALTER COLUMN status TYPE vehicle_status
      USING status::vehicle_status
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE van_proposal_status AS ENUM('sent','accepted','rejected');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    ALTER TABLE van_proposals
      ALTER COLUMN status TYPE van_proposal_status
      USING status::van_proposal_status
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE van_contract_status AS ENUM(
        'contracting','pending_delivery','active','return_pending','completed','cancelled'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    ALTER TABLE van_contracts
      ALTER COLUMN status TYPE van_contract_status
      USING status::van_contract_status
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE van_incident_status AS ENUM('received','in_progress','resolved');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    ALTER TABLE van_incidents
      ALTER COLUMN status TYPE van_incident_status
      USING status::van_incident_status
  `);

  // ── Add new columns to existing tables ──────────────────────────────────
  console.log("Adding columns to vehicles...");
  const vehicleCols = [
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS grade TEXT`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vin TEXT`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS license_plate TEXT`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS black_number_status TEXT`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compulsory_insurance_expiry TEXT`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiry TEXT`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS gps_device_id TEXT`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS smoking_policy TEXT`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rental_company_amount NUMERIC(10,2)`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS chat_van_fee NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS max_period_months INTEGER`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mileage_limit INTEGER`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS excess_mileage_fee INTEGER`,
    `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const col of vehicleCols) {
    await db.execute(sql.raw(col)).catch(() => {});
  }

  console.log("Adding columns to van_applications...");
  const appCols = [
    `ALTER TABLE van_applications ADD COLUMN IF NOT EXISTS delivery_type TEXT`,
    `ALTER TABLE van_applications ADD COLUMN IF NOT EXISTS current_vehicle TEXT`,
    `ALTER TABLE van_applications ADD COLUMN IF NOT EXISTS assigned_to TEXT`,
  ];
  for (const col of appCols) {
    await db.execute(sql.raw(col)).catch(() => {});
  }

  console.log("Adding columns to van_contracts...");
  const contractCols = [
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS rental_company_id INTEGER REFERENCES rental_companies(id)`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS min_period_months INTEGER DEFAULT 1`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS rental_company_amount NUMERIC(10,2)`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS chat_van_fee NUMERIC(10,2)`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS next_payment_date TEXT`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS contract_provider TEXT DEFAULT 'SIN JAPAN'`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS vehicle_provider TEXT`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS platform_operator TEXT DEFAULT 'SIN JAPAN'`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ`,
    `ALTER TABLE van_contracts ADD COLUMN IF NOT EXISTS signature_data TEXT`,
  ];
  for (const col of contractCols) {
    await db.execute(sql.raw(col)).catch(() => {});
  }

  console.log("Adding columns to rental_companies...");
  const rcCols = [
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS legal_name TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS settlement_terms TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS bank_info TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS business_hours TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS emergency_contact TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS accident_contact TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS breakdown_contact TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS recovery_contact TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS insurance_terms TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS started_at TEXT`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'prospect'`,
    `ALTER TABLE rental_companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const col of rcCols) {
    await db.execute(sql.raw(col)).catch(() => {});
  }

  console.log("Adding columns to van_proposals...");
  await db.execute(sql`ALTER TABLE van_proposals ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE van_proposals ADD COLUMN IF NOT EXISTS accepted_vehicle_id INTEGER`).catch(() => {});

  // ── Create new enum types for new tables ────────────────────────────────
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE kyc_status AS ENUM('not_started','submitted','verified','rejected','expired');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE screening_result AS ENUM('pending','approved','conditional','rejected');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE van_payment_status AS ENUM('pending','authorized','paid','failed','retrying','overdue','refunded','partially_refunded','cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE insurance_policy_status AS ENUM('active','expiring_soon','expired','cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE return_status AS ENUM('requested','scheduled','in_progress','inspecting','completed','cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE recovery_case_status AS ENUM('contacting','return_requested','overdue','location_check','recovery_requested','recovered','closed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.execute(sql`
    DO $$ BEGIN CREATE TYPE rental_company_status AS ENUM('prospect','reviewing','active','suspended','terminated');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // ── Create new tables ─────────────────────────────────────────────────
  console.log("Creating identity_verifications...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS identity_verifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      application_id INTEGER REFERENCES van_applications(id),
      full_name TEXT, dob TEXT, address TEXT, phone TEXT, email TEXT,
      license_front_path TEXT, license_back_path TEXT, license_expiry TEXT, license_type TEXT,
      emergency_name TEXT, emergency_phone TEXT, emergency_relation TEXT,
      occupation TEXT, delivery_history TEXT, usage_purpose TEXT,
      status kyc_status NOT NULL DEFAULT 'not_started',
      admin_notes TEXT, verified_at TIMESTAMPTZ, rejected_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating screenings...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS screenings (
      id SERIAL PRIMARY KEY,
      application_id INTEGER REFERENCES van_applications(id) NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      result screening_result NOT NULL DEFAULT 'pending',
      method TEXT DEFAULT 'manual',
      conditions TEXT, reason TEXT, admin_notes TEXT,
      reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating van_payments...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS van_payments (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES van_contracts(id) NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      currency TEXT DEFAULT 'jpy',
      payment_type TEXT NOT NULL,
      billing_period TEXT,
      status van_payment_status NOT NULL DEFAULT 'pending',
      payment_provider TEXT, payment_method_token TEXT,
      provider_payment_id TEXT, provider_status TEXT,
      paid_at TIMESTAMPTZ, due_date TEXT, notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating van_payment_retries...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS van_payment_retries (
      id SERIAL PRIMARY KEY,
      payment_id INTEGER REFERENCES van_payments(id) NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      failure_code TEXT, failure_message TEXT, provider_retry_id TEXT,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating insurance_policies...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS insurance_policies (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES vehicles(id),
      contract_id INTEGER REFERENCES van_contracts(id),
      insurer TEXT, policy_number TEXT,
      start_date TEXT, expiry_date TEXT,
      liability_person TEXT, liability_property TEXT,
      vehicle_coverage TEXT, personal_accident TEXT,
      deductible TEXT, driver_restriction TEXT, age_restriction TEXT,
      commercial_use_allowed BOOLEAN DEFAULT TRUE,
      policy_file_path TEXT,
      status insurance_policy_status NOT NULL DEFAULT 'active',
      admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating gps_devices...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gps_devices (
      id SERIAL PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      vehicle_id INTEGER REFERENCES vehicles(id),
      is_connected BOOLEAN DEFAULT FALSE,
      last_communicated_at TIMESTAMPTZ,
      provider TEXT, provider_device_id TEXT, notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating gps_locations...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gps_locations (
      id SERIAL PRIMARY KEY,
      device_id INTEGER REFERENCES gps_devices(id) NOT NULL,
      vehicle_id INTEGER REFERENCES vehicles(id),
      latitude NUMERIC(10,7), longitude NUMERIC(10,7),
      altitude NUMERIC(8,2), speed NUMERIC(6,2), heading NUMERIC(5,2),
      mileage INTEGER, ignition BOOLEAN, battery_level INTEGER,
      recorded_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating van_returns...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS van_returns (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES van_contracts(id) NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
      return_date TEXT, return_location TEXT, reason TEXT,
      status return_status NOT NULL DEFAULT 'requested',
      admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating van_return_inspections...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS van_return_inspections (
      id SERIAL PRIMARY KEY,
      return_id INTEGER REFERENCES van_returns(id) NOT NULL,
      exterior_ok BOOLEAN, interior_ok BOOLEAN, scratch_notes TEXT,
      mileage_at_return INTEGER, fuel_level TEXT,
      key_returned BOOLEAN, etc_card_returned BOOLEAN,
      accessories_ok BOOLEAN, cleaning_status TEXT, photos TEXT,
      etc_charge NUMERIC(10,2) DEFAULT 0,
      fuel_charge NUMERIC(10,2) DEFAULT 0,
      late_return_charge NUMERIC(10,2) DEFAULT 0,
      excess_mileage_charge NUMERIC(10,2) DEFAULT 0,
      cleaning_charge NUMERIC(10,2) DEFAULT 0,
      damage_charge NUMERIC(10,2) DEFAULT 0,
      key_loss_charge NUMERIC(10,2) DEFAULT 0,
      recovery_charge NUMERIC(10,2) DEFAULT 0,
      other_charge NUMERIC(10,2) DEFAULT 0,
      other_charge_note TEXT,
      inspected_by TEXT, inspected_at TIMESTAMPTZ, admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating recovery_cases...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS recovery_cases (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES van_contracts(id) NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
      case_type TEXT NOT NULL,
      status recovery_case_status NOT NULL DEFAULT 'contacting',
      return_deadline TEXT, contact_history TEXT,
      gps_last_location TEXT, gps_last_communicated_at TIMESTAMPTZ,
      rental_company_notified_at TIMESTAMPTZ,
      recovery_requested_at TIMESTAMPTZ, recovered_at TIMESTAMPTZ,
      recovery_fee TEXT, admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("Creating audit_logs...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor TEXT NOT NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      before TEXT,
      after TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("✅ Full migration completed successfully!");
}

run().catch(e => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
