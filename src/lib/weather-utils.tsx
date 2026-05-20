import React from 'react';
import { Sun, Cloud, CloudRain, CloudLightning, Snowflake, CloudFog, CloudSun } from 'lucide-react';

export function getWeatherInfo(code: number): { text: string; icon: React.ElementType; color: string } {
  // WMO Weather interpretation codes (WW)
  switch (true) {
    case code === 0:
      return { text: "快晴", icon: Sun, color: "text-orange-400" };
    case code === 1 || code === 2:
      return { text: "晴れ/曇り", icon: CloudSun, color: "text-orange-300" };
    case code === 3:
      return { text: "曇り", icon: Cloud, color: "text-slate-400" };
    case code === 45 || code === 48:
      return { text: "霧", icon: CloudFog, color: "text-slate-400" };
    case code >= 51 && code <= 55:
      return { text: "霧雨", icon: CloudRain, color: "text-blue-300" };
    case code >= 61 && code <= 65:
      return { text: "雨", icon: CloudRain, color: "text-blue-500" };
    case code >= 80 && code <= 82:
      return { text: "にわか雨", icon: CloudRain, color: "text-blue-400" };
    case code >= 71 && code <= 77:
    case code >= 85 && code <= 86:
      return { text: "雪", icon: Snowflake, color: "text-blue-200" };
    case code >= 95 && code <= 99:
      return { text: "雷雨", icon: CloudLightning, color: "text-yellow-400" };
    default:
      return { text: "不明", icon: Cloud, color: "text-slate-400" };
  }
}
