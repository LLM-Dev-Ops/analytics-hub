/**
 * Sankey Diagram
 * Flow diagram showing relationships and transfers between nodes
 */

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey';
import { ChartComponentProps } from './ChartRegistry';

interface SankeyData {
  nodes: Array<{ name: string; color?: string }>;
  links: Array<{ source: number; target: number; value: number }>;
}

interface SankeyProps extends ChartComponentProps {
  data: SankeyData;
  config?: {
    nodeWidth?: number;
    nodePadding?: number;
    colors?: string[];
    showValues?: boolean;
  };
}

const SankeyDiagram: React.FC<SankeyProps> = ({
  data,
  config = {},
  width: propWidth,
  height: propHeight = 600,
  onDataPointClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: propWidth || 900, height: propHeight });

  const {
    nodeWidth = 20,
    nodePadding = 10,
    colors = d3.schemeCategory10,
    showValues = true,
  } = config;

  useEffect(() => {
    if (!svgRef.current || !data.nodes || !data.links) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create sankey generator
    const sankeyGenerator = sankey<any, any>()
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .extent([[0, 0], [width, height]]);

    // Generate sankey layout
    const { nodes, links } = sankeyGenerator({
      nodes: data.nodes.map(d => ({ ...d })),
      links: data.links.map(d => ({ ...d })),
    });

    // Color scale
    const color = d3.scaleOrdinal(colors);

    // Add links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (d: any) => color(d.source.name))
      .attr('stroke-width', (d: any) => Math.max(1, d.width))
      .attr('fill', 'none')
      .attr('opacity', 0.3)
      .on('mouseover', function() {
        d3.select(this).attr('opacity', 0.6);
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.3);
      });

    // Add link labels
    if (showValues) {
      link.append('title')
        .text((d: any) => `${d.source.name} → ${d.target.name}\n${d.value}`);
    }

    // Add nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g');

    node.append('rect')
      .attr('x', (d: any) => d.x0)
      .attr('y', (d: any) => d.y0)
      .attr('height', (d: any) => d.y1 - d.y0)
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('fill', (d: any) => d.color || color(d.name))
      .attr('stroke', '#000')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        if (onDataPointClick) {
          onDataPointClick(d);
        }
      });

    // Add node labels
    node.append('text')
      .attr('x', (d: any) => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
      .attr('y', (d: any) => (d.y1 + d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d: any) => d.x0 < width / 2 ? 'start' : 'end')
      .text((d: any) => d.name)
      .attr('font-size', '12px');

    // Add node tooltips
    node.append('title')
      .text((d: any) => `${d.name}\n${d.value}`);

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

export default SankeyDiagram;
