'use client';

import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { colors } from '@/themes/platform/tokens';

interface MiniChartProps {
  data: Array<{ date: string; value: number | null }>;
  color?: string;
  height?: number;
  showAxes?: boolean;
  showTooltip?: boolean;
  barChart?: boolean;
}

export function MiniChart({
  data,
  color = colors.accentLime,
  height = 40,
  showAxes = false,
  showTooltip,
  barChart = false,
}: MiniChartProps) {
  const resolvedShowTooltip = showTooltip ?? showAxes;

  const tooltipStyle = {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.borderDefault}`,
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    color: colors.textPrimary,
    boxShadow: 'none',
  };

  const tooltipFormatter = (value: unknown) => [
    typeof value === 'number' ? value.toFixed(2) : String(value ?? ''),
    '',
  ];

  if (barChart) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          {showAxes && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={colors.borderDefault}
              vertical={false}
            />
          )}
          {showAxes && (
            <XAxis
              dataKey="date"
              tick={{ fill: colors.textMuted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
          )}
          {showAxes && (
            <YAxis
              tick={{ fill: colors.textMuted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
          )}
          {resolvedShowTooltip && (
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={tooltipFormatter}
              cursor={{ fill: colors.borderDefault }}
            />
          )}
          <Bar dataKey="value" fill={color} radius={2} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        {showAxes && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.borderDefault}
            vertical={false}
          />
        )}
        {showAxes && (
          <XAxis
            dataKey="date"
            tick={{ fill: colors.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
        )}
        {showAxes && (
          <YAxis
            tick={{ fill: colors.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
        )}
        {resolvedShowTooltip && (
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={tooltipFormatter}
            cursor={{ stroke: colors.borderDefault }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={showAxes ? 2 : 1.5}
          dot={showAxes ? { fill: color, r: 3, strokeWidth: 0 } : false}
          activeDot={resolvedShowTooltip ? { r: 4, fill: color, strokeWidth: 0 } : false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
