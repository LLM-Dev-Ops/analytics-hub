/**
 * Time Series Line Chart
 * Advanced time-series chart with zoom, pan, and real-time updates using D3.js
 */

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChartComponentProps } from './ChartRegistry';
import { TimeSeriesPoint } from '@/types/metrics';

interface TimeSeriesLineChartProps extends ChartComponentProps {
  data: TimeSeriesPoint[];
  config?: {
    colors?: string[];
    showGrid?: boolean;
    enableZoom?: boolean;
    enablePan?: boolean;
    showTooltip?: boolean;
    lineWidth?: number;
    showDots?: boolean;
    animationDuration?: number;
  };
  isRealtime?: boolean;
}

const TimeSeriesLineChart: React.FC<TimeSeriesLineChartProps> = ({
  data,
  config = {},
  width: propWidth,
  height: propHeight = 400,
  onDataPointClick,
  isRealtime = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: propWidth || 800, height: propHeight });

  const {
    colors = ['#3b82f6'],
    showGrid = true,
    enableZoom = true,
    enablePan = true,
    showTooltip = true,
    lineWidth = 2,
    showDots = false,
    animationDuration = 300,
  } = config;

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 30, bottom: 30, left: 50 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // Clear previous content
    svg.selectAll('*').remove();

    // Create main group
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates and create scales
    const parseDate = (d: TimeSeriesPoint) => new Date(d.timestamp);
    const x = d3.scaleTime()
      .domain(d3.extent(data, parseDate) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 0])
      .nice()
      .range([height, 0]);

    // Create line generator
    const line = d3.line<TimeSeriesPoint>()
      .x(d => x(parseDate(d)))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    // Add grid
    if (showGrid) {
      g.append('g')
        .attr('class', 'grid')
        .attr('opacity', 0.1)
        .call(
          d3.axisLeft(y)
            .tickSize(-width)
            .tickFormat(() => '')
        );
    }

    // Add axes
    const xAxis = g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x));

    const yAxis = g.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(y));

    // Add line path
    const path = g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', colors[0])
      .attr('stroke-width', lineWidth)
      .attr('d', line);

    // Animate line drawing
    if (animationDuration > 0 && !isRealtime) {
      const totalLength = path.node()?.getTotalLength() || 0;
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(animationDuration)
        .ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0);
    }

    // Add dots if enabled
    if (showDots) {
      g.selectAll('.dot')
        .data(data)
        .enter()
        .append('circle')
        .attr('class', 'dot')
        .attr('cx', d => x(parseDate(d)))
        .attr('cy', d => y(d.value))
        .attr('r', 3)
        .attr('fill', colors[0])
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          if (onDataPointClick) {
            onDataPointClick(d);
          }
        });
    }

    // Add tooltip
    if (showTooltip) {
      const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'chart-tooltip')
        .style('position', 'absolute')
        .style('visibility', 'hidden')
        .style('background-color', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '8px')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('z-index', '1000');

      // Add invisible overlay for tooltip interaction
      const overlay = g.append('rect')
        .attr('class', 'overlay')
        .attr('width', width)
        .attr('height', height)
        .style('fill', 'none')
        .style('pointer-events', 'all');

      const focus = g.append('g')
        .attr('class', 'focus')
        .style('display', 'none');

      focus.append('circle')
        .attr('r', 4)
        .attr('fill', colors[0]);

      overlay
        .on('mousemove', function(event) {
          const [mx] = d3.pointer(event);
          const bisect = d3.bisector<TimeSeriesPoint, Date>(d => parseDate(d)).left;
          const date = x.invert(mx);
          const index = bisect(data, date, 1);
          const d0 = data[index - 1];
          const d1 = data[index];

          if (d0 && d1) {
            const d = date.getTime() - parseDate(d0).getTime() > parseDate(d1).getTime() - date.getTime() ? d1 : d0;

            focus.attr('transform', `translate(${x(parseDate(d))},${y(d.value)})`);
            focus.style('display', null);

            tooltip
              .style('visibility', 'visible')
              .html(`
                <div>
                  <strong>${parseDate(d).toLocaleString()}</strong><br/>
                  Value: ${d.value.toFixed(2)}
                </div>
              `)
              .style('left', `${event.pageX + 10}px`)
              .style('top', `${event.pageY - 28}px`);
          }
        })
        .on('mouseout', () => {
          focus.style('display', 'none');
          tooltip.style('visibility', 'hidden');
        });

      // Cleanup tooltip on unmount
      return () => {
        tooltip.remove();
      };
    }

    // Add zoom behavior
    if (enableZoom || enablePan) {
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, 10])
        .translateExtent([[0, 0], [width, height]])
        .extent([[0, 0], [width, height]])
        .on('zoom', (event) => {
          const newX = event.transform.rescaleX(x);
          xAxis.call(d3.axisBottom(newX));

          path.attr('d', line.x(d => newX(parseDate(d))));

          if (showDots) {
            g.selectAll('.dot')
              .attr('cx', (d: any) => newX(parseDate(d)));
          }
        });

      svg.call(zoom);
    }
  }, [data, dimensions, config, isRealtime, onDataPointClick]);

  // Handle responsive resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height: propHeight });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [propHeight]);

  return (
    <div ref={containerRef} style={{ width: propWidth || '100%', height: propHeight }}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: 'block' }}
      />
    </div>
  );
};

export default TimeSeriesLineChart;
