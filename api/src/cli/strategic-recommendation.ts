#!/usr/bin/env node

/**
 * Strategic Recommendation Agent CLI
 *
 * Provides command-line interface for running strategic recommendation analysis,
 * viewing executive summaries, and inspecting recommendations.
 *
 * Usage:
 *   npx @analytics-hub/cli strategic-recommendation <command> [options]
 *
 * Commands:
 *   analyze    - Run strategic recommendation analysis
 *   summarize  - Get executive summary of recent insights
 *   inspect    - View details of a specific recommendation
 *   list       - List recent recommendations
 *
 * @module cli/strategic-recommendation
 */

import { program } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'perf_hooks';

/**
 * CLI exit codes
 */
const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_INPUT: 2,
  NOT_FOUND: 3,
  TIMEOUT: 4,
  RATE_LIMITED: 5,
  SERVICE_UNAVAILABLE: 6,
} as const;

/**
 * CLI output formats
 */
type OutputFormat = 'json' | 'text';

/**
 * Telemetry event for CLI invocations
 */
interface TelemetryEvent {
  invocationId: string;
  timestamp: string;
  command: string;
  options: Record<string, unknown>;
  startTime: number;
  endTime?: number;
  duration?: number;
  exitCode?: number;
  error?: string;
  outputFormat: OutputFormat;
}

/**
 * Strategic Recommendation for display
 */
interface RecommendationDisplay {
  recommendationId: string;
  category: string;
  priority: string;
  title: string;
  description: string;
  confidence: number;
  timeHorizon: string;
  expectedImpact?: {
    costSavings?: number;
    performanceGain?: number;
    riskReduction?: number;
  };
}

/**
 * Analysis result
 */
interface AnalysisResult {
  success: boolean;
  recommendations: RecommendationDisplay[];
  totalSignalsAnalyzed: number;
  trendsIdentified: number;
  correlationsFound: number;
  overallConfidence: number;
  analysisMetadata: {
    timeWindow: {
      startTime: string;
      endTime: string;
    };
    layersAnalyzed: string[];
    processingDuration?: number;
  };
}

/**
 * Executive summary
 */
interface ExecutiveSummary {
  period: string;
  totalRecommendations: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  averageConfidence: number;
  topRecommendations: RecommendationDisplay[];
  actionItems: Array<{
    title: string;
    priority: string;
    dueDate?: string;
  }>;
}

/**
 * Get environment configuration
 */
function getConfig(): {
  apiUrl: string;
  telemetryPath: string;
  cachePath: string;
  outputPath: string;
} {
  return {
    apiUrl:
      process.env.ANALYTICS_HUB_API_URL || 'http://localhost:3000',
    telemetryPath:
      process.env.ANALYTICS_HUB_TELEMETRY_PATH ||
      resolve(process.cwd(), '.analytics-telemetry'),
    cachePath:
      process.env.ANALYTICS_HUB_CACHE_PATH ||
      resolve(process.cwd(), '.analytics-cache'),
    outputPath:
      process.env.ANALYTICS_HUB_OUTPUT_PATH ||
      resolve(process.cwd(), '.analytics-output'),
  };
}

/**
 * Record telemetry event
 */
function recordTelemetry(event: TelemetryEvent): void {
  try {
    const config = getConfig();
    const telemetryFile = resolve(config.telemetryPath, 'cli-events.jsonl');

    const eventLine = JSON.stringify(event) + '\n';
    writeFileSync(telemetryFile, eventLine, { flag: 'a' });
  } catch (error) {
    // Silently fail telemetry recording - don't block CLI operations
    if (process.env.DEBUG_CLI === 'true') {
      console.error('Failed to record telemetry:', error);
    }
  }
}

/**
 * Parse ISO date string safely
 */
function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return date;
}

/**
 * Format date for output
 */
function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Format confidence as percentage
 */
function formatConfidence(confidence: number): string {
  return `${(confidence * 100).toFixed(1)}%`;
}

/**
 * Format currency
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format percentage
 */
function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Output formatted text
 */
function outputText(result: AnalysisResult | ExecutiveSummary): void {
  if ('analysisMetadata' in result) {
    // Analysis result
    const analysis = result as AnalysisResult;
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          STRATEGIC RECOMMENDATION ANALYSIS REPORT           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('Analysis Metadata:');
    console.log(
      `  Time Window: ${analysis.analysisMetadata.timeWindow.startTime} to ${analysis.analysisMetadata.timeWindow.endTime}`
    );
    console.log(
      `  Layers Analyzed: ${analysis.analysisMetadata.layersAnalyzed.join(', ')}`
    );
    if (analysis.analysisMetadata.processingDuration) {
      console.log(
        `  Processing Duration: ${analysis.analysisMetadata.processingDuration}ms`
      );
    }

    console.log('\nAnalysis Summary:');
    console.log(
      `  Total Signals Analyzed: ${analysis.totalSignalsAnalyzed}`
    );
    console.log(`  Trends Identified: ${analysis.trendsIdentified}`);
    console.log(`  Correlations Found: ${analysis.correlationsFound}`);
    console.log(
      `  Overall Confidence: ${formatConfidence(analysis.overallConfidence)}`
    );

    console.log(
      `\nRecommendations (${analysis.recommendations.length} total):\n`
    );

    analysis.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec.title}`);
      console.log(`   ID: ${rec.recommendationId}`);
      console.log(
        `   Category: ${rec.category} | Priority: ${rec.priority} | Time Horizon: ${rec.timeHorizon}`
      );
      console.log(`   Confidence: ${formatConfidence(rec.confidence)}`);
      console.log(`   Description: ${rec.description}`);

      if (rec.expectedImpact) {
        console.log('   Expected Impact:');
        if (rec.expectedImpact.costSavings !== undefined) {
          console.log(
            `     - Cost Savings: ${formatCurrency(rec.expectedImpact.costSavings)}`
          );
        }
        if (rec.expectedImpact.performanceGain !== undefined) {
          console.log(
            `     - Performance Gain: ${formatPercentage(rec.expectedImpact.performanceGain)}`
          );
        }
        if (rec.expectedImpact.riskReduction !== undefined) {
          console.log(
            `     - Risk Reduction: ${formatPercentage(rec.expectedImpact.riskReduction)}`
          );
        }
      }
      console.log();
    });
  } else {
    // Executive summary
    const summary = result as ExecutiveSummary;
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          EXECUTIVE SUMMARY - STRATEGIC INSIGHTS              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Period: ${summary.period}`);
    console.log(`Total Recommendations: ${summary.totalRecommendations}`);
    console.log(`Average Confidence: ${formatConfidence(summary.averageConfidence)}\n`);

    console.log('Distribution by Category:');
    Object.entries(summary.byCategory).forEach(([category, count]) => {
      console.log(`  - ${category}: ${count}`);
    });

    console.log('\nDistribution by Priority:');
    Object.entries(summary.byPriority).forEach(([priority, count]) => {
      console.log(`  - ${priority.toUpperCase()}: ${count}`);
    });

    if (summary.topRecommendations.length > 0) {
      console.log(`\nTop Recommendations (${summary.topRecommendations.length}):\n`);
      summary.topRecommendations.forEach((rec, index) => {
        console.log(
          `${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`
        );
        console.log(
          `   Category: ${rec.category} | Confidence: ${formatConfidence(rec.confidence)}`
        );
        console.log();
      });
    }

    if (summary.actionItems.length > 0) {
      console.log(`Action Items (${summary.actionItems.length}):\n`);
      summary.actionItems.forEach((item, index) => {
        console.log(`${index + 1}. [${item.priority}] ${item.title}`);
        if (item.dueDate) {
          console.log(`   Due: ${item.dueDate}`);
        }
        console.log();
      });
    }
  }
}

/**
 * Generate mock analysis result (for demonstration)
 */
function generateMockAnalysis(options: {
  startTime: string;
  endTime: string;
  domains: string[];
  focusAreas: string[];
}): AnalysisResult {
  const startTime = parseDate(options.startTime);
  const endTime = parseDate(options.endTime);

  const recommendations: RecommendationDisplay[] = [
    {
      recommendationId: uuidv4(),
      category: 'cost-optimization',
      priority: 'high',
      title:
        'Optimize LLM inference costs by implementing request batching',
      description:
        'Analysis shows 40% of requests can be batched, reducing API calls by 35%',
      confidence: 0.87,
      timeHorizon: 'short-term',
      expectedImpact: {
        costSavings: 15000,
        performanceGain: 0.12,
      },
    },
    {
      recommendationId: uuidv4(),
      category: 'performance-improvement',
      priority: 'critical',
      title: 'Implement caching layer for prompt embeddings',
      description:
        'Detected 65% cache hit potential for embeddings across domains',
      confidence: 0.92,
      timeHorizon: 'immediate',
      expectedImpact: {
        performanceGain: 0.45,
        costSavings: 8000,
      },
    },
    {
      recommendationId: uuidv4(),
      category: 'capacity-planning',
      priority: 'high',
      title: 'Scale GPU allocation for peak load periods',
      description:
        'Traffic analysis shows consistent 80% utilization during 2-4pm UTC',
      confidence: 0.79,
      timeHorizon: 'medium-term',
      expectedImpact: {
        riskReduction: 0.35,
      },
    },
    {
      recommendationId: uuidv4(),
      category: 'governance-compliance',
      priority: 'medium',
      title: 'Enhance audit logging for compliance requirements',
      description:
        'Current logging covers 82% of required audit points, gaps identified',
      confidence: 0.68,
      timeHorizon: 'short-term',
    },
    {
      recommendationId: uuidv4(),
      category: 'risk-mitigation',
      priority: 'high',
      title: 'Implement circuit breaker for external API calls',
      description:
        'Detected 3 cascading failures in past 30 days from external timeouts',
      confidence: 0.84,
      timeHorizon: 'short-term',
      expectedImpact: {
        riskReduction: 0.5,
      },
    },
  ];

  return {
    success: true,
    recommendations: options.focusAreas.length > 0
      ? recommendations.filter((rec) =>
          options.focusAreas.some((area) =>
            rec.category.toLowerCase().includes(area.toLowerCase())
          )
        )
      : recommendations,
    totalSignalsAnalyzed: 1245,
    trendsIdentified: 18,
    correlationsFound: 34,
    overallConfidence: 0.82,
    analysisMetadata: {
      timeWindow: {
        startTime: formatDate(startTime),
        endTime: formatDate(endTime),
      },
      layersAnalyzed: [
        'observatory',
        'cost-ops',
        'governance',
        ...(options.domains || []),
      ],
      processingDuration: 2847,
    },
  };
}

/**
 * Generate mock executive summary
 */
function generateMockSummary(limit: number = 5): ExecutiveSummary {
  const allRecommendations = [
    {
      recommendationId: uuidv4(),
      category: 'cost-optimization',
      priority: 'high',
      title: 'Optimize LLM inference costs',
      description: 'Implementation of request batching',
      confidence: 0.87,
      timeHorizon: 'short-term',
    },
    {
      recommendationId: uuidv4(),
      category: 'performance-improvement',
      priority: 'critical',
      title: 'Implement caching layer for embeddings',
      description: 'Cache hit potential analysis',
      confidence: 0.92,
      timeHorizon: 'immediate',
    },
    {
      recommendationId: uuidv4(),
      category: 'capacity-planning',
      priority: 'high',
      title: 'Scale GPU allocation for peak load',
      description: 'Traffic analysis during peak hours',
      confidence: 0.79,
      timeHorizon: 'medium-term',
    },
    {
      recommendationId: uuidv4(),
      category: 'governance-compliance',
      priority: 'medium',
      title: 'Enhance audit logging',
      description: 'Compliance audit point coverage',
      confidence: 0.68,
      timeHorizon: 'short-term',
    },
    {
      recommendationId: uuidv4(),
      category: 'risk-mitigation',
      priority: 'high',
      title: 'Implement circuit breaker pattern',
      description: 'Cascading failure prevention',
      confidence: 0.84,
      timeHorizon: 'short-term',
    },
  ];

  return {
    period: 'Last 30 days',
    totalRecommendations: allRecommendations.length,
    byCategory: {
      'cost-optimization': 2,
      'performance-improvement': 1,
      'capacity-planning': 1,
      'governance-compliance': 1,
      'risk-mitigation': 1,
    },
    byPriority: {
      critical: 1,
      high: 3,
      medium: 1,
      low: 0,
    },
    averageConfidence: 0.82,
    topRecommendations: allRecommendations
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return (
          (priorityOrder[a.priority as keyof typeof priorityOrder] || 4) -
          (priorityOrder[b.priority as keyof typeof priorityOrder] || 4)
        );
      })
      .slice(0, limit),
    actionItems: [
      {
        title: 'Review and approve embedding cache implementation',
        priority: 'critical',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
      {
        title: 'Evaluate request batching ROI',
        priority: 'high',
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
      {
        title: 'Schedule capacity planning meeting',
        priority: 'high',
      },
    ],
  };
}

/**
 * Analyze command handler
 */
async function handleAnalyze(options: {
  startTime: string;
  endTime: string;
  domains?: string;
  focusAreas?: string;
  outputFormat: OutputFormat;
}): Promise<void> {
  const startTime = performance.now();
  const invocationId = uuidv4();

  try {
    // Parse options
    const startDate = parseDate(options.startTime);
    const endDate = parseDate(options.endTime);

    if (startDate >= endDate) {
      throw new Error('Start time must be before end time');
    }

    const domains = options.domains ? options.domains.split(',') : [];
    const focusAreas = options.focusAreas ? options.focusAreas.split(',') : [];

    // Generate analysis (mock for now)
    const result = generateMockAnalysis({
      startTime: options.startTime,
      endTime: options.endTime,
      domains,
      focusAreas,
    });

    // Output results
    if (options.outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      outputText(result);
    }

    // Record telemetry
    const duration = performance.now() - startTime;
    recordTelemetry({
      invocationId,
      timestamp: new Date().toISOString(),
      command: 'analyze',
      options: {
        startTime: options.startTime,
        endTime: options.endTime,
        domains,
        focusAreas,
        outputFormat: options.outputFormat,
      },
      startTime,
      endTime: performance.now(),
      duration,
      exitCode: EXIT_CODES.SUCCESS,
      outputFormat: options.outputFormat,
    });

    process.exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    recordTelemetry({
      invocationId,
      timestamp: new Date().toISOString(),
      command: 'analyze',
      options,
      startTime,
      endTime: performance.now(),
      duration,
      exitCode: EXIT_CODES.GENERAL_ERROR,
      error: errorMsg,
      outputFormat: options.outputFormat,
    });

    if (options.outputFormat === 'json') {
      console.error(
        JSON.stringify(
          {
            success: false,
            error: errorMsg,
            invocationId,
          },
          null,
          2
        )
      );
    } else {
      console.error(`Error: ${errorMsg}`);
    }

    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
}

/**
 * Summarize command handler
 */
async function handleSummarize(options: {
  limit: number;
  format: OutputFormat;
}): Promise<void> {
  const startTime = performance.now();
  const invocationId = uuidv4();

  try {
    // Generate summary (mock for now)
    const result = generateMockSummary(options.limit);

    // Output results
    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      outputText(result);
    }

    // Record telemetry
    const duration = performance.now() - startTime;
    recordTelemetry({
      invocationId,
      timestamp: new Date().toISOString(),
      command: 'summarize',
      options: {
        limit: options.limit,
        format: options.format,
      },
      startTime,
      endTime: performance.now(),
      duration,
      exitCode: EXIT_CODES.SUCCESS,
      outputFormat: options.format,
    });

    process.exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    recordTelemetry({
      invocationId,
      timestamp: new Date().toISOString(),
      command: 'summarize',
      options,
      startTime,
      endTime: performance.now(),
      duration,
      exitCode: EXIT_CODES.GENERAL_ERROR,
      error: errorMsg,
      outputFormat: options.format,
    });

    if (options.format === 'json') {
      console.error(
        JSON.stringify(
          {
            success: false,
            error: errorMsg,
            invocationId,
          },
          null,
          2
        )
      );
    } else {
      console.error(`Error: ${errorMsg}`);
    }

    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
}

/**
 * Inspect command handler
 */
async function handleInspect(
  id: string,
  options: {
    format: OutputFormat;
  }
): Promise<void> {
  const startTime = performance.now();
  const invocationId = uuidv4();

  try {
    if (!id) {
      throw new Error('Recommendation ID is required');
    }

    // Mock recommendation lookup
    const recommendation: RecommendationDisplay = {
      recommendationId: id,
      category: 'cost-optimization',
      priority: 'high',
      title: 'Optimize LLM inference costs by implementing request batching',
      description:
        'Analysis shows 40% of requests can be batched, reducing API calls by 35%',
      confidence: 0.87,
      timeHorizon: 'short-term',
      expectedImpact: {
        costSavings: 15000,
        performanceGain: 0.12,
      },
    };

    const result = {
      success: true,
      recommendation,
      relatedRecommendations: [
        {
          recommendationId: uuidv4(),
          category: 'performance-improvement',
          priority: 'high',
          title: 'Related performance recommendation',
          description: 'Complementary optimization',
          confidence: 0.75,
          timeHorizon: 'short-term',
        },
      ],
      implementationGuidance: {
        steps: [
          'Step 1: Evaluate batching strategy',
          'Step 2: Implement queue management',
          'Step 3: Run pilot with 10% of traffic',
          'Step 4: Monitor metrics and rollout',
        ],
        estimatedEffort: '2-3 weeks',
        riskLevel: 'low',
      },
    };

    // Output results
    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║             RECOMMENDATION DETAILS                           ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log(`ID: ${recommendation.recommendationId}`);
      console.log(`Title: ${recommendation.title}`);
      console.log(`Category: ${recommendation.category}`);
      console.log(`Priority: ${recommendation.priority}`);
      console.log(`Confidence: ${formatConfidence(recommendation.confidence)}`);
      console.log(`Time Horizon: ${recommendation.timeHorizon}`);
      console.log(`\nDescription:\n${recommendation.description}`);

      if (recommendation.expectedImpact) {
        console.log('\nExpected Impact:');
        if (recommendation.expectedImpact.costSavings) {
          console.log(
            `  - Cost Savings: ${formatCurrency(recommendation.expectedImpact.costSavings)}`
          );
        }
        if (recommendation.expectedImpact.performanceGain) {
          console.log(
            `  - Performance Gain: ${formatPercentage(recommendation.expectedImpact.performanceGain)}`
          );
        }
      }
    }

    // Record telemetry
    const duration = performance.now() - startTime;
    recordTelemetry({
      invocationId,
      timestamp: new Date().toISOString(),
      command: 'inspect',
      options: {
        id,
        format: options.format,
      },
      startTime,
      endTime: performance.now(),
      duration,
      exitCode: EXIT_CODES.SUCCESS,
      outputFormat: options.format,
    });

    process.exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    recordTelemetry({
      invocationId,
      timestamp: new Date().toISOString(),
      command: 'inspect',
      options: { id, ...options },
      startTime,
      endTime: performance.now(),
      duration,
      exitCode: EXIT_CODES.NOT_FOUND,
      error: errorMsg,
      outputFormat: options.format,
    });

    if (options.format === 'json') {
      console.error(
        JSON.stringify(
          {
            success: false,
            error: errorMsg,
            invocationId,
          },
          null,
          2
        )
      );
    } else {
      console.error(`Error: ${errorMsg}`);
    }

    process.exit(EXIT_CODES.NOT_FOUND);
  }
}

/**
 * List command handler
 */
async function handleList(options: {
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  format: OutputFormat;
}): Promise<void> {
  const startTime = performance.now();
  const invocationId = uuidv4();

  try {
    // Mock recommendation listing
    const recommendations: RecommendationDisplay[] = [
      {
        recommendationId: uuidv4(),
        category: 'cost-optimization',
        priority: 'high',
        title: 'Optimize LLM inference costs by implementing request batching',
        description: 'Analysis shows 40% of requests can be batched',
        confidence: 0.87,
        timeHorizon: 'short-term',
      },
      {
        recommendationId: uuidv4(),
        category: 'performance-improvement',
        priority: 'critical',
        title: 'Implement caching layer for prompt embeddings',
        description: 'Detected 65% cache hit potential',
        confidence: 0.92,
        timeHorizon: 'immediate',
      },
      {
        recommendationId: uuidv4(),
        category: 'capacity-planning',
        priority: 'high',
        title: 'Scale GPU allocation for peak load periods',
        description: 'Traffic analysis shows consistent 80% utilization',
        confidence: 0.79,
        timeHorizon: 'medium-term',
      },
    ];

    const result = {
      success: true,
      recommendations: recommendations.slice(
        options.offset,
        options.offset + options.limit
      ),
      total: recommendations.length,
      limit: options.limit,
      offset: options.offset,
      hasMore: options.offset + options.limit < recommendations.length,
    };

    // Output results
    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║             RECENT RECOMMENDATIONS                          ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log(
        `Showing ${result.recommendations.length} of ${result.total} recommendations\n`
      );

      result.recommendations.forEach((rec, index) => {
        console.log(
          `${options.offset + index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`
        );
        console.log(`   ID: ${rec.recommendationId}`);
        console.log(
          `   Category: ${rec.category} | Confidence: ${formatConfidence(rec.confidence)}`
        );
        console.log();
      });

      if (result.hasMore) {
        console.log(
          `... and ${result.total - (options.offset + options.limit)} more`
        );
        console.log(
          `Use --offset ${options.offset + options.limit} to see more results`
        );
      }
    }

    // Record telemetry
    const duration = performance.now() - startTime;
    recordTelemetry({
      invocationId,
      timestamp: new Date().toISOString(),
      command: 'list',
      options: {
        limit: options.limit,
        offset: options.offset,
        startTime: options.startTime,
        endTime: options.endTime,
        format: options.format,
      },
      startTime,
      endTime: performance.now(),
      duration,
      exitCode: EXIT_CODES.SUCCESS,
      outputFormat: options.format,
    });

    process.exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    recordTelemetry({
      invocationId,
      timestamp: new Date().toISOString(),
      command: 'list',
      options,
      startTime,
      endTime: performance.now(),
      duration,
      exitCode: EXIT_CODES.GENERAL_ERROR,
      error: errorMsg,
      outputFormat: options.format,
    });

    if (options.format === 'json') {
      console.error(
        JSON.stringify(
          {
            success: false,
            error: errorMsg,
            invocationId,
          },
          null,
          2
        )
      );
    } else {
      console.error(`Error: ${errorMsg}`);
    }

    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
}

/**
 * Initialize CLI program
 */
function initializeProgram(): void {
  program
    .name('@analytics-hub/cli strategic-recommendation')
    .description('Strategic Recommendation Agent CLI')
    .version('1.0.0');

  /**
   * Analyze command
   */
  program
    .command('analyze')
    .description('Run strategic recommendation analysis')
    .requiredOption(
      '--start-time <datetime>',
      'Start time (ISO 8601 format)',
      (value) => {
        parseDate(value); // Validate
        return value;
      }
    )
    .requiredOption(
      '--end-time <datetime>',
      'End time (ISO 8601 format)',
      (value) => {
        parseDate(value); // Validate
        return value;
      }
    )
    .option(
      '--domains <list>',
      'Comma-separated list of domains to analyze'
    )
    .option(
      '--focus-areas <list>',
      'Comma-separated list of focus areas (cost-optimization, performance-improvement, risk-mitigation, capacity-planning, governance-compliance, strategic-initiative)'
    )
    .option(
      '--output-format <format>',
      'Output format (json|text)',
      'json' as OutputFormat
    )
    .action((options) => {
      handleAnalyze(options);
    });

  /**
   * Summarize command
   */
  program
    .command('summarize')
    .description('Get executive summary of recent insights')
    .option(
      '--limit <number>',
      'Maximum number of recommendations to include',
      '5'
    )
    .option(
      '--format <format>',
      'Output format (json|text)',
      'json' as OutputFormat
    )
    .action((options) => {
      handleSummarize({
        limit: parseInt(options.limit, 10),
        format: options.format,
      });
    });

  /**
   * Inspect command
   */
  program
    .command('inspect <id>')
    .description('View details of a specific recommendation')
    .option(
      '--format <format>',
      'Output format (json|text)',
      'json' as OutputFormat
    )
    .action((id, options) => {
      handleInspect(id, options);
    });

  /**
   * List command
   */
  program
    .command('list')
    .description('List recent recommendations')
    .option('--limit <number>', 'Maximum number of recommendations', '10')
    .option('--offset <number>', 'Offset for pagination', '0')
    .option('--start-time <datetime>', 'Filter by start time (ISO 8601 format)')
    .option('--end-time <datetime>', 'Filter by end time (ISO 8601 format)')
    .option(
      '--format <format>',
      'Output format (json|text)',
      'json' as OutputFormat
    )
    .action((options) => {
      handleList({
        limit: parseInt(options.limit, 10),
        offset: parseInt(options.offset, 10),
        startTime: options.startTime,
        endTime: options.endTime,
        format: options.format,
      });
    });

  // Parse arguments
  program.parse(process.argv);

  // Show help if no command provided
  if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(EXIT_CODES.INVALID_INPUT);
  }
}

/**
 * Main entry point
 */
if (require.main === module) {
  initializeProgram();
}

export {
  handleAnalyze,
  handleSummarize,
  handleInspect,
  handleList,
  getConfig,
  recordTelemetry,
  EXIT_CODES,
};

// Default export for CLI lazy-loading
export default initializeProgram;
