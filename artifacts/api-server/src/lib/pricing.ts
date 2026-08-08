/**
 * Chat LOGI — 料金計算エンジン
 * DB設定対応版：settingsテーブルから料金設定を読み込み
 */

// ── 地域マスタ ────────────────────────────────────────────────────────────────

const PREFECTURE_REGION: Record<string, number> = {
  北海道: 0,
  青森: 1, 岩手: 1, 宮城: 1, 秋田: 1, 山形: 1, 福島: 1,
  茨城: 2, 栃木: 2, 群馬: 2, 埼玉: 2, 千葉: 2, 東京: 2, 神奈川: 2,
  新潟: 3, 富山: 3, 石川: 3, 福井: 3, 山梨: 3, 長野: 3, 岐阜: 3, 静岡: 3, 愛知: 3,
  三重: 4, 滋賀: 4, 京都: 4, 大阪: 4, 兵庫: 4, 奈良: 4, 和歌山: 4,
  鳥取: 5, 島根: 5, 岡山: 5, 広島: 5, 山口: 5,
  徳島: 6, 香川: 6, 愛媛: 6, 高知: 6,
  福岡: 7, 佐賀: 7, 長崎: 7, 熊本: 7, 大分: 7, 宮崎: 7, 鹿児島: 7,
  沖縄: 8,
};

const REGION_DIST: number[][] = [
  [50,  500, 800, 900, 950, 1050, 1100, 1200, 1700],
  [500,  50, 350, 450, 600, 750,  800,  900, 1600],
  [800, 350,  50, 250, 500, 650,  700,  800, 1600],
  [900, 450, 250,  50, 200, 400,  500,  700, 1500],
  [950, 600, 500, 200,  50, 200,  300,  500, 1400],
  [1050,750, 650, 400, 200,  50,  150,  300, 1300],
  [1100,800, 700, 500, 300, 150,   50,  200, 1200],
  [1200,900, 800, 700, 500, 300,  200,   50, 1100],
  [1700,1600,1600,1500,1400,1300,1200, 1100,  50],
];

function estimateDistance(pickup: string, delivery: string): number {
  const r1 = inferRegion(pickup);
  const r2 = inferRegion(delivery);
  if (r1 === null || r2 === null) return 300;
  return REGION_DIST[r1][r2];
}

function inferRegion(address: string): number | null {
  for (const [pref, region] of Object.entries(PREFECTURE_REGION)) {
    if (address.includes(pref)) return region;
  }
  return null;
}

// ── 距離帯 ────────────────────────────────────────────────────────────────────
export type DistanceTier = 'local' | 'short' | 'mid' | 'long' | 'xlong';
export const DISTANCE_TIER_LABELS: Record<DistanceTier, string> = {
  local: '近距離 (<30km)',
  short: '短距離 (<100km)',
  mid:   '中距離 (<300km)',
  long:  '長距離 (<600km)',
  xlong: '超長距離 (600km+)',
};

function distanceTier(km: number): DistanceTier {
  if (km < 30)  return 'local';
  if (km < 100) return 'short';
  if (km < 300) return 'mid';
  if (km < 600) return 'long';
  return 'xlong';
}

// ── デフォルト設定（ハードコード基準値） ────────────────────────────────────
export type VehicleSize = '軽貨物' | '1t' | '2t' | '4t' | '10t' | '大型';
export type BodyType = '平ボディ' | 'ウイング' | 'バン' | '冷凍冷蔵' | '幌';

export const VEHICLE_SIZES: VehicleSize[] = ['軽貨物', '1t', '2t', '4t', '10t', '大型'];
export const BODY_TYPES: BodyType[] = ['平ボディ', 'ウイング', 'バン', '冷凍冷蔵', '幌'];
export const DISTANCE_TIERS: DistanceTier[] = ['local', 'short', 'mid', 'long', 'xlong'];

export interface PricingConfig {
  /** マージン率 (例: 0.30 = 30%) */
  margin: number;
  /** 最低顧客請求額（円） */
  minPrice: number;
  /** 車両×距離帯 庸車相場（円/台） */
  basePrice: Record<VehicleSize, Record<DistanceTier, number>>;
  /** ボディタイプ割増率 */
  bodyRate: Record<BodyType, number>;
  /** 付帯作業料（円/台） */
  workFee: Record<string, number>;
  /** 高速代見込み（円/距離帯） */
  highwayFee: Record<DistanceTier, number>;
}

export const DEFAULT_CONFIG: PricingConfig = {
  margin: 0.15,
  minPrice: 8000,
  basePrice: {
    軽貨物: { local: 7500,  short: 13000, mid: 16000, long: 22000, xlong: 32000 },
    '1t':   { local: 8000,  short: 18000, mid: 26000, long: 36000, xlong: 50000 },
    '2t':   { local: 12000, short: 28000, mid: 40000, long: 55000, xlong: 75000 },
    '4t':   { local: 20000, short: 45000, mid: 62000, long: 75000, xlong: 105000 },
    '10t':  { local: 35000, short: 80000, mid: 105000, long: 140000, xlong: 190000 },
    大型:   { local: 50000, short: 120000, mid: 160000, long: 210000, xlong: 280000 },
  },
  bodyRate: {
    平ボディ: 1.00,
    ウイング: 1.10,
    バン:     1.05,
    冷凍冷蔵: 1.35,
    幌:       1.05,
  },
  workFee: {
    手積み:     5000,
    手降ろし:   5000,
    ラッシング: 3000,
    養生:       5000,
    搬入:       5000,
    搬出:       5000,
  },
  highwayFee: {
    local: 0,
    short: 1500,
    mid:   4000,
    long:  8000,
    xlong: 14000,
  },
};

/** DB key-value rows から PricingConfig に変換 */
export function parsePricingConfig(rows: { key: string; value: string }[]): PricingConfig {
  const cfg: PricingConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  for (const { key, value } of rows) {
    const num = parseFloat(value);
    if (isNaN(num)) continue;
    // pricing_margin / pricing_min_price
    if (key === 'pricing_margin') { cfg.margin = num; continue; }
    if (key === 'pricing_min_price') { cfg.minPrice = num; continue; }
    // pricing_base_軽貨物_short など
    const baseMatch = key.match(/^pricing_base_(.+)_(local|short|mid|long|xlong)$/);
    if (baseMatch) {
      const [, v, t] = baseMatch;
      if (cfg.basePrice[v as VehicleSize]) cfg.basePrice[v as VehicleSize][t as DistanceTier] = num;
      continue;
    }
    // pricing_body_ウイング など
    const bodyMatch = key.match(/^pricing_body_(.+)$/);
    if (bodyMatch) {
      const [, b] = bodyMatch;
      if (b in cfg.bodyRate) cfg.bodyRate[b as BodyType] = num;
      continue;
    }
    // pricing_work_手積み など
    const workMatch = key.match(/^pricing_work_(.+)$/);
    if (workMatch) {
      const [, w] = workMatch;
      if (w in cfg.workFee) cfg.workFee[w] = num;
      continue;
    }
    // pricing_highway_short など
    const hwMatch = key.match(/^pricing_highway_(local|short|mid|long|xlong)$/);
    if (hwMatch) {
      const [, t] = hwMatch;
      cfg.highwayFee[t as DistanceTier] = num;
    }
  }
  return cfg;
}

/** PricingConfig を DB key-value 形式に展開 */
export function serializePricingConfig(cfg: PricingConfig): Record<string, string> {
  const out: Record<string, string> = {
    pricing_margin:    String(cfg.margin),
    pricing_min_price: String(cfg.minPrice),
  };
  for (const v of VEHICLE_SIZES) {
    for (const t of DISTANCE_TIERS) {
      out[`pricing_base_${v}_${t}`] = String(cfg.basePrice[v][t]);
    }
  }
  for (const b of BODY_TYPES) {
    out[`pricing_body_${b}`] = String(cfg.bodyRate[b]);
  }
  for (const [w, fee] of Object.entries(cfg.workFee)) {
    out[`pricing_work_${w}`] = String(fee);
  }
  for (const t of DISTANCE_TIERS) {
    out[`pricing_highway_${t}`] = String(cfg.highwayFee[t]);
  }
  return out;
}

// ── 計算ヘルパー ──────────────────────────────────────────────────────────────

function calcAdditionalWorkFee(additionalWork: string | null | undefined, workFee: Record<string, number>): number {
  if (!additionalWork) return 0;
  let fee = 0;
  for (const [key, val] of Object.entries(workFee)) {
    if (additionalWork.includes(key)) fee += val;
  }
  return fee;
}

// ── メイン計算関数 ────────────────────────────────────────────────────────────

export interface PricingInput {
  vehicleSize: string;
  vehicleBodyType: string;
  truckCount: number;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  deliveryType?: string | null;
  additionalWork?: string | null;
  highwayUse?: boolean | null;
  isUrgent?: boolean;
}

export interface PricingResult {
  customerPrice: number;
  carrierCost: number;
  grossProfit: number;
  distanceKm: number;
  breakdown: {
    base: number;
    bodyMultiplier: number;
    deliveryMultiplier: number;
    additionalWork: number;
    highway: number;
    truckCount: number;
    minPriceApplied: boolean;
  };
}

export function calcPriceWithConfig(input: PricingInput, config: PricingConfig = DEFAULT_CONFIG): PricingResult {
  const { vehicleSize, vehicleBodyType, truckCount, pickupAddress, deliveryAddress,
          deliveryType, additionalWork, highwayUse, isUrgent = false } = input;

  const km = estimateDistance(pickupAddress ?? '', deliveryAddress ?? '');
  const tier = distanceTier(km);

  const sizeKey = (vehicleSize as VehicleSize) in config.basePrice
    ? (vehicleSize as VehicleSize) : '2t';
  const basePerTruck = config.basePrice[sizeKey][tier];

  const bodyRate = (vehicleBodyType as BodyType) in config.bodyRate
    ? config.bodyRate[vehicleBodyType as BodyType] : 1.0;

  const deliveryRate = isUrgent ? 1.3 : deliveryType === '定期' ? 0.85 : 1.0;

  const additionalFeePerTruck = calcAdditionalWorkFee(additionalWork, config.workFee);
  const highwayFeePerTruck = highwayUse ? config.highwayFee[tier] : 0;

  const carrierPerTruck = Math.ceil(basePerTruck * bodyRate * deliveryRate / 100) * 100
    + additionalFeePerTruck + highwayFeePerTruck;

  const carrierCost = carrierPerTruck * truckCount;
  const rawCustomerPrice = Math.ceil(carrierCost / (1 - config.margin) / 100) * 100;

  // 最低料金を適用
  const minPriceApplied = rawCustomerPrice < config.minPrice;
  const customerPrice = minPriceApplied ? config.minPrice : rawCustomerPrice;
  const grossProfit = customerPrice - carrierCost;

  return {
    customerPrice,
    carrierCost,
    grossProfit,
    distanceKm: km,
    breakdown: {
      base: basePerTruck,
      bodyMultiplier: bodyRate,
      deliveryMultiplier: deliveryRate,
      additionalWork: additionalFeePerTruck,
      highway: highwayFeePerTruck,
      truckCount,
      minPriceApplied,
    },
  };
}

/** 後方互換：デフォルト設定で計算 */
export function calcPrice(input: PricingInput): PricingResult {
  return calcPriceWithConfig(input, DEFAULT_CONFIG);
}
