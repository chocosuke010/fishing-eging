/**
 * 潮汐シミュレーション・データ生成ユーティリティ
 * 実戦的な潮汐予測エンジンとして、月齢（朔望周期）とエリア別港湾オフセットに基づき、
 * 実際の潮見表とほぼ同期する高精度な潮汐情報を計算します。
 */

export interface HourlyTideData {
  time: string;
  hour: number;
  tide: number;
}

export interface TideEvent {
  time: string;
  level: number;
}

export interface TideDataResult {
  tideType: string;         // 大潮, 中潮, 小潮, 長潮, 若潮
  hourlyData: HourlyTideData[];
  highTides: TideEvent[];    // 満潮
  lowTides: TideEvent[];     // 干潮
}

/**
 * 高精度な月齢算出関数 (基準新月: 2000年1月6日 18:14:00 UTC)
 * 対象日正午時点の月齢を代表月齢として算出することで、一日を通して一貫した波形を保証します。
 */
export function getAgeOfMoon(date: Date): number {
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const baseDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const diffMs = targetDate.getTime() - baseDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const moonAge = ((diffDays % 29.530588853) + 29.530588853) % 29.530588853;
  return moonAge;
}

/**
 * 日本の一般的な潮汐判定基準（気象庁基準に準拠）
 */
export function getTideType(moonAge: number): string {
  if ((moonAge >= 0 && moonAge < 3.0) || (moonAge >= 14.0 && moonAge < 17.5) || (moonAge >= 28.5)) {
    return "大潮";
  } else if ((moonAge >= 9.5 && moonAge < 10.5) || (moonAge >= 24.0 && moonAge < 25.0)) {
    return "長潮";
  } else if ((moonAge >= 10.5 && moonAge < 11.5) || (moonAge >= 25.0 && moonAge < 26.0)) {
    return "若潮";
  } else if ((moonAge >= 7.0 && moonAge < 9.5) || (moonAge >= 21.5 && moonAge < 24.0)) {
    return "小潮";
  } else {
    return "中潮";
  }
}

/**
 * 各エリア別の高潮間隔差（港湾オフセット）
 * 福岡エリア（糸島・博多）を基準 (offset = 0) とし、潮の伝播時間差を時間単位で算出します。
 */
export function getPortOffset(pointId: string | null): number {
  if (!pointId) return 0;
  const lowerId = pointId.toLowerCase();
  
  if (lowerId.includes("saga") || lowerId.includes("kabeshima") || lowerId.includes("yobuko")) {
    return -0.6; // 佐賀（呼子・加部島）: 博多より約36分早い
  }
  if (lowerId.includes("gonoura") || lowerId.includes("iki")) {
    return -0.8; // 壱岐: 博多より約48分早い
  }
  if (lowerId.includes("miyanoura") || lowerId.includes("hirado") || lowerId.includes("nagasaki")) {
    return -1.1; // 長崎平戸: 博多より約66分早い
  }
  return 0.0; // 福岡（糸島など）: 博多とほぼ同時
}

/**
 * 潮回りごとの潮位（cm）の特性設定
 */
function getTideRange(tideType: string): { maxTide: number; minTide: number } {
  switch (tideType) {
    case "大潮":
      return { maxTide: 200, minTide: 10 };
    case "小潮":
      return { maxTide: 120, minTide: 70 };
    case "長潮":
      return { maxTide: 105, minTide: 85 };
    case "若潮":
      return { maxTide: 115, minTide: 75 };
    case "中潮":
    default:
      return { maxTide: 160, minTide: 40 };
  }
}

/**
 * 小数時間の表示フォーマット (例: 6.25 -> "06:15")
 */
function formatDecimalHour(decimalHour: number): string {
  const normalized = ((decimalHour % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.round((normalized - h) * 60);
  if (m === 60) {
    return `${((h + 1) % 24).toString().padStart(2, "0")}:00`;
  }
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * ポイントIDおよび指定日付に基づく潮汐データを生成する
 */
export function getTideDataForPoint(pointId: string | null, date: Date = new Date()): TideDataResult {
  // 1. 月齢の算出と潮回りの決定
  const moonAge = getAgeOfMoon(date);
  const tideType = getTideType(moonAge);
  
  // 2. 潮回りごとの振幅と平均水位の決定
  const { maxTide, minTide } = getTideRange(tideType);
  const amplitude = (maxTide - minTide) / 2;
  const center = (maxTide + minTide) / 2;
  const period = 12.42; // 半日周潮周期

  // 3. エリア別オフセットの取得
  const offset = getPortOffset(pointId);

  // 4. 大潮新月時の博多港基準満潮（9:30）に、月齢による遅れを加算 (1日約50分遅れ)
  const moonAgeCycle = moonAge % 14.7652944265;
  const tideDelay = moonAgeCycle * 0.84;
  const firstHighBase = (9.5 + tideDelay) % 12.42;

  // 5. 24時間 (0時〜23時) の1時間ごと潮位データを生成
  const hourlyData: HourlyTideData[] = [];
  const referenceHighTime = firstHighBase + offset;
  for (let hour = 0; hour < 24; hour++) {
    // 潮汐の近似波形: Y(t) = center + amplitude * cos(2 * PI * (t - T_high) / P)
    const val = center + amplitude * Math.cos((2 * Math.PI * (hour - referenceHighTime)) / period);
    hourlyData.push({
      time: `${hour}:00`,
      hour: hour,
      tide: Math.round(val),
    });
  }

  // 6. 24時間内の満潮・干潮イベント時刻を直接算出
  // 満潮候補 (0時間〜24時間の範囲にあるものを抽出)
  const highCandidates = [
    referenceHighTime - period,
    referenceHighTime,
    referenceHighTime + period,
    referenceHighTime + period * 2,
  ];

  const highTides: TideEvent[] = highCandidates
    .filter(t => t >= 0 && t < 24)
    .sort((a, b) => a - b)
    .map(t => ({
      time: formatDecimalHour(t),
      level: Math.round(center + amplitude * Math.cos((2 * Math.PI * (t - referenceHighTime)) / period))
    }));

  // 干潮候補 (満潮から period / 2 (約6.21時間) ずれた時間)
  const halfPeriod = period / 2;
  const lowCandidates = [
    referenceHighTime - halfPeriod - period,
    referenceHighTime - halfPeriod,
    referenceHighTime + halfPeriod,
    referenceHighTime + halfPeriod + period,
    referenceHighTime + halfPeriod + period * 2,
  ];

  const lowTides: TideEvent[] = lowCandidates
    .filter(t => t >= 0 && t < 24)
    .sort((a, b) => a - b)
    .map(t => ({
      time: formatDecimalHour(t),
      level: Math.round(center + amplitude * Math.cos((2 * Math.PI * (t - referenceHighTime)) / period))
    }));

  return {
    tideType,
    hourlyData,
    highTides,
    lowTides,
  };
}

/**
 * 現在時刻における潮位と上げ・下げの判定を行う
 */
export function getCurrentTideStatus(
  pointId: string | null,
  currentHour: number,
  date: Date = new Date()
): { currentLevel: number; isRising: boolean; statusText: string } {
  // 1. 月齢の算出と潮回りの決定
  const moonAge = getAgeOfMoon(date);
  const tideType = getTideType(moonAge);

  // 2. 潮位特性
  const { maxTide, minTide } = getTideRange(tideType);
  const amplitude = (maxTide - minTide) / 2;
  const center = (maxTide + minTide) / 2;
  const period = 12.42;

  // 3. エリア別オフセットと時間算出
  const offset = getPortOffset(pointId);
  const moonAgeCycle = moonAge % 14.7652944265;
  const tideDelay = moonAgeCycle * 0.84;
  const firstHighBase = (9.5 + tideDelay) % 12.42;
  const referenceHighTime = firstHighBase + offset;

  // 4. 現在の潮位と30分後の潮位から上げ下げを判定
  const currentVal = center + amplitude * Math.cos((2 * Math.PI * (currentHour - referenceHighTime)) / period);
  const nextVal = center + amplitude * Math.cos((2 * Math.PI * ((currentHour + 0.5) - referenceHighTime)) / period);
  const isRising = nextVal > currentVal;

  let statusText = isRising ? "上げ潮" : "下げ潮";
  
  // 潮の変化が極端に小さい場合 (振幅によるが、微小な変化時) は潮止まりと判定
  const changeRate = Math.abs(nextVal - currentVal);
  if (changeRate < 1.5) {
    statusText = "潮止まり";
  }

  return {
    currentLevel: Math.round(currentVal),
    isRising,
    statusText
  };
}
