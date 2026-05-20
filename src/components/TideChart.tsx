"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { HourlyTideData } from "@/lib/tide-utils";

interface TideChartProps {
  data: HourlyTideData[];
  currentHour: number;
  currentLevel: number;
}

export default function TideChart({ data, currentHour, currentLevel }: TideChartProps) {
  // ツールチップのカスタムUI
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-xl shadow-xl backdrop-blur-md">
          <p className="text-xs font-bold text-slate-400">{payload[0].payload.time}</p>
          <p className="text-sm font-black text-cyan-400 mt-1">
            潮位: <span className="text-white text-base font-black">{payload[0].value}</span> cm
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-56 md:h-64 select-none relative">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 20, right: 10, left: -25, bottom: 0 }}
        >
          <defs>
            <linearGradient id="tideColor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          
          <XAxis 
            dataKey="hour" 
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: '600' }}
            ticks={[0, 3, 6, 9, 12, 15, 18, 21, 23]}
            tickFormatter={(value) => `${value}:00`}
          />
          
          <YAxis 
            domain={[0, 220]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: '600' }}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          {/* 現在時刻の基準縦線 */}
          <ReferenceLine 
            x={Math.floor(currentHour)} 
            stroke="#ef4444" 
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ 
              value: "現在", 
              position: "top", 
              fill: "#ef4444", 
              fontSize: 10,
              fontWeight: "800"
            }}
          />

          {/* 波形面（Area） */}
          <Area
            type="monotone"
            dataKey="tide"
            stroke="#06b6d4"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#tideColor)"
            dot={false}
            activeDot={{
              r: 6,
              fill: "#22d3ee",
              stroke: "#0f172a",
              strokeWidth: 2
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
