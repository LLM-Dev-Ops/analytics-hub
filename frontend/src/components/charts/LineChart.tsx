/**
 * Line Chart Component
 * Time-series line chart using Recharts
 */

import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChartComponentProps } from './ChartRegistry';
import { useUIStore } from '@/store/uiStore';

interface LineChartProps extends ChartComponentProps {
  data: Array<Record<string, string | number>>;
  config?: {
    xKey?: string;
    yKey?: string;
    colors?: string[];
    showGrid?: boolean;
    showLegend?: boolean;
    animate?: boolean;
    strokeWidth?: number;
  };
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  config = {},
  width,
  height,
  onDataPointClick,
}) => {
  const preferences = useUIStore((state) => state.preferences);

  const {
    xKey = 'timestamp',
    yKey = 'value',
    colors = preferences.defaultChartColors,
    showGrid = preferences.showGridLines,
    showLegend = true,
    animate = preferences.animationsEnabled,
    strokeWidth = 2,
  } = config;

  const handleClick = (data: unknown) => {
    if (onDataPointClick) {
      onDataPointClick(data);
    }
  };

  return (
    <ResponsiveContainer width={width || '100%'} height={height || 400}>
      <RechartsLineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
        <XAxis
          dataKey={xKey}
          stroke="#888"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          stroke="#888"
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        {showLegend && <Legend />}
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={colors[0]}
          strokeWidth={strokeWidth}
          dot={{ r: 3 }}
          activeDot={{ r: 5, onClick: handleClick }}
          isAnimationActive={animate}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
};

export default LineChart;
