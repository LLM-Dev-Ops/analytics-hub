/**
 * Heatmap Chart
 * Matrix visualization with color-coded cells using D3.js
 */

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChartComponentProps } from './ChartRegistry';

interface HeatmapDataPoint {
  x: string | number;
  y: string | number;
  value: number;
}

interface HeatmapProps extends ChartComponentProps {
  data: HeatmapDataPoint[];
  config?: {
    colorScheme?: 'blues' | 'reds' | 'greens' | 'purples' | 'viridis' | 'plasma';
    showValues?: boolean;
    cellPadding?: number;
    minValue?: number;
    maxValue?: number;
  };
}

const Heatmap: React.FC<HeatmapProps> = ({
  data,
  config = {},
  width: propWidth,
  height: propHeight = 400,
  onDataPointClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: propWidth || 800, height: propHeight });

  const {
    colorScheme = 'blues',
    showValues = false,
    cellPadding = 2,
    minValue,
    maxValue,
  } = config;

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 30, right: 30, bottom: 60, left: 60 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get unique x and y values
    const xLabels = Array.from(new Set(data.map(d => d.x)));
    const yLabels = Array.from(new Set(data.map(d => d.y)));

    // Create scales
    const x = d3.scaleBand()
      .domain(xLabels.map(String))
      .range([0, width])
      .padding(0.05);

    const y = d3.scaleBand()
      .domain(yLabels.map(String))
      .range([0, height])
      .padding(0.05);

    // Color scale
    const colorScales: Record<string, any> = {
      blues: d3.interpolateBlues,
      reds: d3.interpolateReds,
      greens: d3.interpolateGreens,
      purples: d3.interpolatePurples,
      viridis: d3.interpolateViridis,
      plasma: d3.interpolatePlasma,
    };

    const colorScale = d3.scaleSequential()
      .interpolator(colorScales[colorScheme] || d3.interpolateBlues)
      .domain([
        minValue !== undefined ? minValue : d3.min(data, d => d.value) || 0,
        maxValue !== undefined ? maxValue : d3.max(data, d => d.value) || 100
      ]);

    // Add cells
    const cells = g.selectAll('.cell')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'cell');

    cells.append('rect')
      .attr('x', d => x(String(d.x)) || 0)
      .attr('y', d => y(String(d.y)) || 0)
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('fill', d => colorScale(d.value))
      .attr('stroke', 'white')
      .attr('stroke-width', cellPadding)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        if (onDataPointClick) {
          onDataPointClick(d);
        }
      })
      .on('mouseover', function() {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('opacity', 0.8);
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('opacity', 1);
      });

    // Add values if enabled
    if (showValues) {
      cells.append('text')
        .attr('x', d => (x(String(d.x)) || 0) + x.bandwidth() / 2)
        .attr('y', d => (y(String(d.y)) || 0) + y.bandwidth() / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', d => d.value > (colorScale.domain()[1] / 2) ? 'white' : 'black')
        .attr('font-size', '10px')
        .text(d => d.value.toFixed(1));
    }

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(y));

    // Add legend
    const legendWidth = 20;
    const legendHeight = height;
    const legendScale = d3.scaleLinear()
      .domain(colorScale.domain())
      .range([legendHeight, 0]);

    const legend = svg.append('g')
      .attr('transform', `translate(${width + margin.left + 10},${margin.top})`);

    const legendSteps = 50;
    const legendData = d3.range(legendSteps).map(i => {
      const value = colorScale.domain()[0] + (i / legendSteps) * (colorScale.domain()[1] - colorScale.domain()[0]);
      return { value, color: colorScale(value) };
    });

    legend.selectAll('rect')
      .data(legendData)
      .enter()
      .append('rect')
      .attr('y', (d, i) => legendHeight - (i / legendSteps) * legendHeight)
      .attr('width', legendWidth)
      .attr('height', legendHeight / legendSteps + 1)
      .attr('fill', d => d.color);

    legend.append('g')
      .attr('transform', `translate(${legendWidth}, 0)`)
      .call(d3.axisRight(legendScale).ticks(5));

  }, [data, dimensions, config, onDataPointClick]);

  return (
    <svg
      ref={svgRef}
      width={dimensions.width}
      height={dimensions.height}
      style={{ display: 'block' }}
    />
  );
};

export default Heatmap;
