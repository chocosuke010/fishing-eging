/**
 * 潮汐シミュレーション・データ生成ユーティリティ
 * MVP検証用として、ポイントごとのハッシュ値から潮汐情報をシミュレートします。
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
 * 簡易文字列ハッシュ関数
 */
function getHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/**
 * 小数時間の表示フォーマット (例: 6.25 -> "06:15")
 */
function formatDecimalHour(decimalHour: number): string {
  const h = Math.floor(decimalHour) % 24;
  const m = Math.round((decimalHour - Math.floor(decimalHour)) * 60);
  const formattedMin = m === 60 ? "00" : m.toString().padStart(2, "0");
  const formattedHour = m === 60 ? ((h + 1) % 24).toString().padStart(2, "0") : h.toString().padStart(2, "0");
  return `${formattedHour}:${formattedMin}`;
}

/**
 * ポイントIDに基づく本日の潮汐データを生成する
 */
export function getTideDataForPoint(pointId: string | null): TideDataResult {
  const seed = pointId || "overall-average-tide-seed";
  const hash = getHashCode(seed);

  // 1. 潮回りの決定 (大潮, 中潮, 小潮, 長潮, 若潮)
  // 出現確率を考慮して適度に分散
  const tideTypes = ["大潮", "中潮", "中潮", "小潮", "小潮", "長潮", "若潮"];
  const tideType = tideTypes[hash % tideTypes.length];

  // 2. 満潮基準時間を決定 (3.0時間 〜 9.0時間の間)
  const baseHighTime = 3.0 + (hash % 61) / 10.0; // 3.0, 3.1, ..., 9.0

  // 3. 潮回りごとの潮位（cm）の特性設定
  let maxTide = 160; // 満潮
  let minTide = 40;  // 干潮

  switch (tideType) {
    case "大潮":
      maxTide = 200;
      minTide = 10;
      break;
    case "小潮":
      maxTide = 120;
      minTide = 70;
      break;
    case "長潮":
      maxTide = 105;
      minTide = 85;
      break;
    case "若潮":
      maxTide = 115;
      minTide = 75;
      break;
    case "中潮":
    default:
      maxTide = 160;
      minTide = 40;
      break;
  }

  const amplitude = (maxTide - minTide) / 2;
  const center = (maxTide + minTide) / 2;
  const period = 12.42; // 日本近海の卓越する半日周潮周期（時間）

  // 4. 24時間 (0時〜23時) の1時間ごと潮位データを生成
  const hourlyData: HourlyTideData[] = [];
  for (let hour = 0; hour < 24; hour++) {
    // 潮汐の近似波形: Y(t) = center + amplitude * cos(2 * PI * (t - T_high) / P)
    const val = center + amplitude * Math.cos((2 * Math.PI * (hour - baseHighTime)) / period);
    hourlyData.push({
      time: `${hour}:00`,
      hour: hour,
      tide: Math.round(val),
    });
  }

  // 5. 24時間内の極値（満潮・干潮）の具体的な時刻と潮位を計算
  const highTides: TideEvent[] = [];
  const lowTides: TideEvent[] = [];
  
  // 10分刻み (0.166時間) または 6分刻み (0.1時間) でスキャンして極大値・極小値を判定
  const scanStep = 0.05; // 3分刻みで精密スキャン
  const scanLimit = 24.0;
  
  let prevVal = center + amplitude * Math.cos((2 * Math.PI * (-scanStep - baseHighTime)) / period);
  
  for (let t = 0.0; t < scanLimit; t += scanStep) {
    const val = center + amplitude * Math.cos((2 * Math.PI * (t - baseHighTime)) / period);
    const nextVal = center + amplitude * Math.cos((2 * Math.PI * ((t + scanStep) - baseHighTime)) / period);

    // 極大値（満潮）の判定: 前後より大きい
    if (val > prevVal && val > nextVal) {
      highTides.push({
        time: formatDecimalHour(t),
        level: Math.round(val)
      });
    }
    // 極小値（干潮）の判定: 前後より小さい
    else if (val < prevVal && val < nextVal) {
      lowTides.push({
        time: formatDecimalHour(t),
        level: Math.round(val)
      });
    }
    
    prevVal = val;
  }

  // 24時間外の直前・直後のイベントが入る場合があるため、重複排除と最大2個ずつの絞り込み
  return {
    tideType,
    hourlyData,
    highTides: highTides.slice(0, 2),
    lowTides: lowTides.slice(0, 2),
  };
}

/**
 * 現在時刻における潮位と上げ・下げの判定を行う
 * @param hourlyData 24時間データ
 * @param currentHour 現在の時刻（0〜23の浮動小数点または整数）
 */
export function getCurrentTideStatus(
  pointId: string | null,
  currentHour: number
): { currentLevel: number; isRising: boolean; statusText: string } {
  const seed = pointId || "overall-average-tide-seed";
  const hash = getHashCode(seed);
  const tideData = getTideDataForPoint(pointId);

  // 潮回りごとの設定を再取得
  let maxTide = 160;
  let minTide = 40;
  switch (tideData.tideType) {
    case "大潮": maxTide = 200; minTide = 10; break;
    case "小潮": maxTide = 120; minTide = 70; break;
    case "長潮": maxTide = 105; minTide = 85; break;
    case "若潮": maxTide = 115; minTide = 75; break;
    default: maxTide = 160; minTide = 40; break;
  }
  
  const amplitude = (maxTide - minTide) / 2;
  const center = (maxTide + minTide) / 2;
  const baseHighTime = 3.0 + (hash % 61) / 10.0;
  const period = 12.42;

  // 現在の潮位
  const currentVal = center + amplitude * Math.cos((2 * Math.PI * (currentHour - baseHighTime)) / period);
  
  // 30分後の潮位と比較して上げ下げを判定
  const nextVal = center + amplitude * Math.cos((2 * Math.PI * ((currentHour + 0.5) - baseHighTime)) / period);
  const isRising = nextVal > currentVal;
  
  // 潮位の極点（前後1時間）から干潮・満潮間近の判定などを追加しても良い
  let statusText = isRising ? "上げ潮" : "下げ潮";
  
  // 潮の変化が非常に小さい場合は「潮止まり」とみなす
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
