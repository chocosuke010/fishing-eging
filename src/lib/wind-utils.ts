/**
 * 角度が指定された範囲内に収まっているかを判定する
 * @param angle 現在の風向（0-360）
 * @param min 範囲の最小値
 * @param max 範囲の最大値
 */
function isAngleInRange(angle: number, min: number, max: number): boolean {
  if (min <= max) {
    return angle >= min && angle <= max;
  } else {
    // 0度を跨ぐ場合（例: min=315, max=45）
    return angle >= min || angle <= max;
  }
}

export type PointWindStatus = "safe" | "danger" | "normal";

export interface AngleRange {
  min: number;
  max: number;
}

/**
 * 風向の角度(度数)を8方位の文字列に変換する
 */
export function get8WindDirectionString(angle: number): string {
  const directions = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  const index = Math.round(angle / 45) % 8;
  return directions[index];
}

/**
 * 8方位の真逆（180度反対）の方位を返す
 */
export function getOppositeDirection(dir: string): string {
  const oppositeMap: Record<string, string> = {
    "北": "南",
    "北東": "南西",
    "東": "西",
    "南東": "北西",
    "南": "北",
    "南西": "北東",
    "西": "東",
    "北西": "南東"
  };
  return oppositeMap[dir] || dir;
}

/**
 * 現在の風速・風向から、そのポイントのステータス（風裏かどうか）を判定する
 */
export function getPointWindStatus(
  currentWindSpeed: number,
  currentWindAngle: number,
  maxTolerance: number,
  safeAngles: AngleRange[],
  dangerAngles: AngleRange[],
  safeWindDirections?: string[]
): PointWindStatus {
  // 1. 8方位配列による風裏判定が指定されている場合
  if (safeWindDirections && safeWindDirections.length > 0) {
    const current8Dir = get8WindDirectionString(currentWindAngle);

    // 風速が許容範囲内（微風）なら、風向に関係なく「通常（または合致すればsafe）」
    if (currentWindSpeed <= maxTolerance) {
      const isSafeDir = safeWindDirections.includes(current8Dir);
      return isSafeDir ? "safe" : "normal";
    }

    // 強風の場合
    // 危険な風向き（風裏方位の真逆＝向かい風）に入っているか
    const dangerDirs = safeWindDirections.map(getOppositeDirection);
    const isDangerDir = dangerDirs.includes(current8Dir);
    if (isDangerDir) {
      return "danger";
    }

    // 危険ではないが、風裏に入っているか
    const isSafeDir = safeWindDirections.includes(current8Dir);
    if (isSafeDir) {
      return "safe";
    }

    return "normal";
  }

  // 2. 従来の角度範囲ベースの判定
  // 1. 風速が許容範囲内（微風）なら、風向に関係なく「通常（釣り可能）」
  if (currentWindSpeed <= maxTolerance) {
    // ただし、風裏設定に合致していれば、さらに「安全(最適)」とする
    const isSafeDir = safeAngles && safeAngles.some(range => isAngleInRange(currentWindAngle, range.min, range.max));
    return isSafeDir ? "safe" : "normal";
  }

  // 2. 風速が強い場合
  // 危険な風向き（向かい風など）に入っているか
  const isDangerDir = dangerAngles && dangerAngles.some(range => isAngleInRange(currentWindAngle, range.min, range.max));
  if (isDangerDir) {
    return "danger";
  }

  // 3. 危険ではないが、風裏（背後から風を受ける・遮蔽物がある）に入っているか
  const isSafeDir = safeAngles && safeAngles.some(range => isAngleInRange(currentWindAngle, range.min, range.max));
  if (isSafeDir) {
    return "safe";
  }

  // どちらでもない場合は、風が強いが向かい風でも風裏でもない（横風など）
  return "normal";
}

/**
 * 風向の角度(度数)を16方位の文字列に変換する
 */
export function getWindDirectionString(angle: number): string {
  const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  const index = Math.round(angle / 22.5) % 16;
  return directions[index];
}
