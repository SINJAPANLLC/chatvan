/**
 * AI logistics engine — rule-based for MVP, structured for easy OpenAI swap.
 * To upgrade: replace the functions with OpenAI API calls preserving the same interfaces.
 */

export interface ExtractedData {
  cargoType?: string;
  cargoQuantity?: string;
  cargoWeight?: string;
  cargoSize?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  pickupDatetime?: string;
  deliveryDeadline?: string;
  vehicleType?: string;
  deliveryMethod?: string;
  hasForklifts?: boolean;
  isUrgent?: boolean;
  temperature?: string;
}

export interface AiQuestion {
  question: string;
  isComplete: boolean;
  extractedData: ExtractedData;
  proposal?: ShipmentProposal;
}

export interface ShipmentProposal {
  vehicleType: string;
  deliveryMethod: string;
  pickupDatetime: string;
  deliveryDatetime: string;
  estimatedPrice: number;
  reason: string;
  notes: string;
}

// Extract logistics info from natural language
export function extractShipmentInfo(
  text: string,
  existing: ExtractedData = {}
): ExtractedData {
  const result: ExtractedData = { ...existing };
  const lower = text.toLowerCase();

  // Cargo type
  if (!result.cargoType) {
    if (lower.includes("パレット") || lower.includes("pallet")) {
      result.cargoType = "パレット";
    } else if (lower.includes("機械") || lower.includes("機器")) {
      result.cargoType = "機械・機器";
    } else if (lower.includes("食品") || lower.includes("食料")) {
      result.cargoType = "食品";
    } else if (lower.includes("家電") || lower.includes("電化製品")) {
      result.cargoType = "家電";
    } else if (lower.includes("衣類") || lower.includes("アパレル")) {
      result.cargoType = "衣類";
    } else if (lower.includes("化学") || lower.includes("薬品")) {
      result.cargoType = "化学品";
    }
  }

  // Cargo quantity
  const palletMatch = text.match(/(\d+)\s*枚/);
  const unitMatch = text.match(/(\d+)\s*(個|箱|ケース|台)/);
  if (palletMatch && !result.cargoQuantity) {
    result.cargoQuantity = `${palletMatch[1]}枚`;
  } else if (unitMatch && !result.cargoQuantity) {
    result.cargoQuantity = `${unitMatch[1]}${unitMatch[2]}`;
  }

  // Weight
  const weightMatch = text.match(/(\d[\d,.]*)\s*(kg|キロ|t\b|トン)/i);
  if (weightMatch && !result.cargoWeight) {
    result.cargoWeight = `${weightMatch[1]}${weightMatch[2]}`;
  }

  // Pickup address
  if (!result.pickupAddress) {
    const prefectures = ["長野", "東京", "大阪", "名古屋", "福岡", "札幌", "横浜", "京都", "神戸", "千葉", "埼玉", "北海道", "愛知", "兵庫"];
    const fromMatch = text.match(/(.{2,6})(から|より)/);
    if (fromMatch) {
      const loc = fromMatch[1];
      if (prefectures.some(p => loc.includes(p)) || loc.length > 3) {
        result.pickupAddress = loc;
      }
    }
    for (const pref of prefectures) {
      if (lower.includes(`${pref}から`) || lower.includes(`${pref}より`)) {
        if (!result.pickupAddress) result.pickupAddress = pref;
      }
    }
  }

  // Delivery address
  if (!result.deliveryAddress) {
    const toMatch = text.match(/(.{2,6})(へ|まで|に届|に送)/);
    if (toMatch) {
      result.deliveryAddress = toMatch[1];
    }
    const prefectures = ["長野", "東京", "大阪", "名古屋", "福岡", "札幌", "横浜", "京都", "神戸", "千葉", "埼玉", "北海道", "愛知", "兵庫"];
    for (const pref of prefectures) {
      if ((lower.includes(`${pref}へ`) || lower.includes(`${pref}まで`)) && !result.deliveryAddress) {
        result.deliveryAddress = pref;
      }
    }
  }

  // Pickup datetime
  if (!result.pickupDatetime) {
    if (lower.includes("明日") || lower.includes("あした")) {
      result.pickupDatetime = "明日";
    } else if (lower.includes("今日") || lower.includes("本日")) {
      result.pickupDatetime = "本日";
    } else if (lower.includes("今週中")) {
      result.pickupDatetime = "今週中";
    } else if (lower.includes("来週")) {
      result.pickupDatetime = "来週";
    } else if (lower.includes("今月中")) {
      result.pickupDatetime = "今月中";
    }
    const timeMatch = text.match(/(\d{1,2})[時:](\d{0,2})/);
    if (timeMatch && result.pickupDatetime) {
      result.pickupDatetime += ` ${timeMatch[1]}時`;
    }
  }

  // Urgency
  if (lower.includes("急ぎ") || lower.includes("至急") || lower.includes("緊急") || lower.includes("今日中") || lower.includes("今すぐ")) {
    result.isUrgent = true;
  }

  // Forklift
  if (lower.includes("フォークリフト") || lower.includes("フォーク")) {
    result.hasForklifts = lower.includes("あり") || lower.includes("ある") || lower.includes("有");
  }

  return result;
}

// Determine what info is still missing
export function getMissingFields(data: ExtractedData): string[] {
  const missing: string[] = [];
  if (!data.pickupAddress) missing.push("pickup_address");
  if (!data.deliveryAddress) missing.push("delivery_address");
  if (!data.cargoType) missing.push("cargo_type");
  if (!data.cargoQuantity) missing.push("cargo_quantity");
  if (!data.pickupDatetime) missing.push("pickup_datetime");
  return missing;
}

const questionMap: Record<string, string> = {
  pickup_address: "集荷先の住所（都道府県・市区町村）を教えてください。",
  delivery_address: "納品先の住所（都道府県・市区町村）を教えてください。",
  cargo_type: "荷物の種類を教えてください。（例：機械部品、食品、家電など）",
  cargo_quantity: "荷物の数量または個数を教えてください。（例：パレット8枚、箱20個）",
  cargo_weight: "おおよその重量は分かりますか？（分からない場合は「不明」でも構いません）",
  pickup_datetime: "ご希望の集荷日時を教えてください。（例：明日の午前中、来週月曜など）",
  delivery_deadline: "納品期限はありますか？",
  forklift: "集荷先と納品先にフォークリフトはありますか？",
};

// Generate next question(s) to ask
export function generateNextQuestion(data: ExtractedData, conversationHistory: string[]): string {
  const missing = getMissingFields(data);

  if (missing.length === 0) {
    return "ありがとうございます。必要な情報が揃いました。最適なプランをご提案します。";
  }

  // Ask 1-2 questions at a time
  const toAsk = missing.slice(0, 2);
  const questions = toAsk.map(f => questionMap[f]).filter(Boolean);

  if (questions.length === 1) {
    return questions[0];
  }
  return questions.join("\n\n");
}

// Recommend vehicle type based on cargo
export function recommendVehicle(data: ExtractedData): string {
  const weightStr = data.cargoWeight || "";
  const quantityStr = data.cargoQuantity || "";

  // Parse weight in kg
  let weightKg = 0;
  const wMatch = weightStr.match(/(\d[\d,.]*)\s*(t\b|トン)/i);
  const kgMatch = weightStr.match(/(\d[\d,.]*)\s*(kg|キロ)/i);
  if (wMatch) {
    weightKg = parseFloat(wMatch[1].replace(",", "")) * 1000;
  } else if (kgMatch) {
    weightKg = parseFloat(kgMatch[1].replace(",", ""));
  }

  // Parse pallets
  const palletMatch = quantityStr.match(/(\d+)\s*枚/);
  const palletCount = palletMatch ? parseInt(palletMatch[1]) : 0;

  if (data.isUrgent && weightKg < 500) return "軽貨物（緊急便）";
  if (weightKg > 10000 || palletCount > 20) return "大型トラック";
  if (weightKg > 4000 || palletCount > 12) return "10tトラック";
  if (weightKg > 2000 || palletCount > 6) return "4tウイング";
  if (weightKg > 800 || palletCount > 2) return "2tトラック";
  if (weightKg > 200) return "1tトラック";
  return "軽貨物";
}

// Calculate estimated price
export function calculateEstimatedPrice(data: ExtractedData): number {
  const vehicle = recommendVehicle(data);

  // Base prices per vehicle type
  const basePrices: Record<string, number> = {
    "軽貨物": 15000,
    "軽貨物（緊急便）": 25000,
    "1tトラック": 25000,
    "2tトラック": 40000,
    "4tウイング": 70000,
    "10tトラック": 120000,
    "大型トラック": 180000,
  };

  let price = basePrices[vehicle] || 40000;

  // Distance premium (rough estimate)
  const longHaulRoutes = ["長野", "北海道", "福岡", "九州", "沖縄", "東北", "青森"];
  const from = data.pickupAddress || "";
  const to = data.deliveryAddress || "";
  const isLongHaul = longHaulRoutes.some(r => from.includes(r) || to.includes(r));
  if (isLongHaul) price *= 1.5;

  // Urgency surcharge
  if (data.isUrgent) price *= 1.3;

  // Round to nearest 1000
  return Math.round(price / 1000) * 1000;
}

// Generate full shipment proposal
export function generateProposal(data: ExtractedData): ShipmentProposal {
  const vehicle = recommendVehicle(data);
  const price = calculateEstimatedPrice(data);

  const pickupTime = data.pickupDatetime || "翌営業日";
  const isFourT = vehicle.includes("4t") || vehicle.includes("10t") || vehicle.includes("大型");
  const isUrgent = data.isUrgent;

  let deliveryDatetime: string;
  if (isUrgent) {
    deliveryDatetime = pickupTime.includes("本日") ? "本日中" : "翌日";
  } else if (isFourT) {
    deliveryDatetime = "集荷翌日午前中";
  } else {
    deliveryDatetime = "集荷翌日";
  }

  let deliveryMethod = "チャーター便";
  if (vehicle === "軽貨物" && !isUrgent) deliveryMethod = "宅配便";
  if (data.cargoQuantity?.includes("定期")) deliveryMethod = "定期便";
  if (isUrgent) deliveryMethod = "緊急便";

  const weightStr = data.cargoWeight ? `・重量${data.cargoWeight}` : "";
  const quantityStr = data.cargoQuantity ? `・数量${data.cargoQuantity}` : "";

  const reason = `荷物の種類（${data.cargoType || "一般貨物"}${quantityStr}${weightStr}）と輸送距離を考慮し、${vehicle}による${deliveryMethod}が最適です。`;

  const notes: string[] = [];
  if (!data.hasForklifts && (vehicle.includes("4t") || vehicle.includes("10t"))) {
    notes.push("フォークリフトの有無をご確認ください。");
  }
  if (isUrgent) notes.push("緊急対応のため、料金に緊急割増が含まれます。");

  return {
    vehicleType: vehicle,
    deliveryMethod,
    pickupDatetime: pickupTime,
    deliveryDatetime,
    estimatedPrice: price,
    reason,
    notes: notes.join(" "),
  };
}

// Main AI processing function
export function processAiMessage(
  userMessage: string,
  existingData: ExtractedData,
  conversationHistory: string[],
  forceProposal = false
): AiQuestion {
  // Extract info from the new message
  const updatedData = extractShipmentInfo(userMessage, existingData);
  const missing = getMissingFields(updatedData);
  const isComplete = missing.length === 0 || forceProposal;

  if (isComplete) {
    const proposal = generateProposal(updatedData);
    return {
      question: "ヒアリングが完了しました。以下の内容でご提案します。",
      isComplete: true,
      extractedData: updatedData,
      proposal,
    };
  }

  const question = generateNextQuestion(updatedData, conversationHistory);
  return {
    question,
    isComplete: false,
    extractedData: updatedData,
  };
}
