#!/usr/bin/env node
/**
 * Consensus Agent CLI
 *
 * Command-line interface for the Consensus Agent.
 * Supports analyze, synthesize, summarize, and inspect operations.
 *
 * @example
 * ```bash
 * # Analyze consensus from stdin
 * cat signals.json | consensus-agent analyze
 *
 * # Synthesize with specific options
 * consensus-agent synthesize --min-agreement 0.7 --method weighted_mean
 *
 * # Summarize consensus results
 * consensus-agent summarize --format json
 *
 * # Inspect specific signal alignment
 * consensus-agent inspect --signal-id signal-123
 * ```
 *
 * @module cli/consensus-agent
 */

import { handleConsensusRequest, healthCheck } from '../agents/consensus/handler';
import {
  AGENT_ID,
  AGENT_VERSION,
  CLI_CONTRACT,
  ConsensusInput,
  SignalInput,
} from '../contracts/consensus-agent';
import { v4 as uuidv4 } from 'uuid';

/**
 * CLI argument parsing result
 */
interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

/**
 * Parse command-line arguments
 */
function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: args[0] || 'analyze',
    flags: {},
    positional: [],
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        result.flags[key] = value;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.flags[key] = args[++i];
      } else {
        result.flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.flags[key] = args[++i];
      } else {
        result.flags[key] = true;
      }
    } else {
      result.positional.push(arg);
    }
  }

  return result;
}

/**
 * Read input from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';

    if (process.stdin.isTTY) {
      resolve('');
      return;
    }

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Parse signal input from various formats
 */
function parseSignalInput(data: string, flags: Record<string, string | boolean>): ConsensusInput {
  // Try to parse as JSON
  let signals: SignalInput[];

  try {
    const parsed = JSON.parse(data);

    if (Array.isArray(parsed)) {
      signals = parsed;
    } else if (parsed.signals && Array.isArray(parsed.signals)) {
      signals = parsed.signals;
    } else {
      throw new Error('Input must be an array of signals or an object with a "signals" array');
    }
  } catch (e) {
    throw new Error(`Failed to parse input: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Build time range from flags or use last 24 hours
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let timeRange = {
    start: defaultStart.toISOString(),
    end: now.toISOString(),
  };

  if (flags['time-range'] && typeof flags['time-range'] === 'string') {
    const [start, end] = flags['time-range'].split(',');
    timeRange = { start, end };
  }

  // Build options from flags
  const options: ConsensusInput['options'] = {
    minAgreementThreshold: flags['min-agreement']
      ? parseFloat(flags['min-agreement'] as string)
      : 0.6,
    aggregationMethod: (flags['method'] as any) || 'weighted_mean',
    confidenceWeighting: (flags['confidence-weighting'] as any) || 'proportional',
    includeDivergentAnalysis: flags['no-divergent'] !== true,
    scopeFilter: flags['scope']
      ? (flags['scope'] as string).split(',')
      : undefined,
  };

  return {
    signals,
    timeRange,
    options,
    executionRef: uuidv4(),
  };
}

/**
 * Format output based on format flag
 */
function formatOutput(
  data: unknown,
  format: string | boolean = 'json'
): string {
  if (format === 'table') {
    return formatAsTable(data);
  }
  if (format === 'yaml') {
    return formatAsYaml(data);
  }
  return JSON.stringify(data, null, 2);
}

/**
 * Format data as ASCII table
 */
function formatAsTable(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return String(data);
  }

  const lines: string[] = [];
  const obj = data as Record<string, unknown>;

  // Find max key length for alignment
  const maxKeyLen = Math.max(...Object.keys(obj).map(k => k.length), 10);

  for (const [key, value] of Object.entries(obj)) {
    const paddedKey = key.padEnd(maxKeyLen);
    const formattedValue = typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
    lines.push(`${paddedKey} │ ${formattedValue}`);
  }

  return lines.join('\n');
}

/**
 * Format data as YAML-like output
 */
function formatAsYaml(data: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (Array.isArray(data)) {
    return data.map(item => `${spaces}- ${formatAsYaml(item, indent + 1).trim()}`).join('\n');
  }

  if (typeof data === 'object' && data !== null) {
    return Object.entries(data as Record<string, unknown>)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${spaces}${key}:\n${formatAsYaml(value, indent + 1)}`;
        }
        return `${spaces}${key}: ${value}`;
      })
      .join('\n');
  }

  return `${spaces}${data}`;
}

/**
 * Analyze command - compute consensus from input signals
 */
async function cmdAnalyze(flags: Record<string, string | boolean>): Promise<void> {
  const stdinData = await readStdin();

  if (!stdinData.trim()) {
    console.error('Error: No input provided. Pipe signal data to stdin.');
    console.error('Example: cat signals.json | consensus-agent analyze');
    process.exit(1);
  }

  try {
    const input = parseSignalInput(stdinData, flags);
    const response = await handleConsensusRequest({ body: input });

    const result = JSON.parse(response.body);
    const format = flags['format'] || 'json';

    console.log(formatOutput(result, format));

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Synthesize command - alias for analyze with synthesis focus
 */
async function cmdSynthesize(flags: Record<string, string | boolean>): Promise<void> {
  return cmdAnalyze(flags);
}

/**
 * Summarize command - output human-readable summary
 */
async function cmdSummarize(flags: Record<string, string | boolean>): Promise<void> {
  const stdinData = await readStdin();

  if (!stdinData.trim()) {
    console.error('Error: No input provided. Pipe signal data to stdin.');
    process.exit(1);
  }

  try {
    const input = parseSignalInput(stdinData, flags);
    const response = await handleConsensusRequest({ body: input });

    const result = JSON.parse(response.body);

    if (!result.success) {
      console.error('Error:', result.error?.message || 'Unknown error');
      process.exit(1);
    }

    const format = flags['format'];

    if (format === 'json') {
      console.log(JSON.stringify({
        consensusAchieved: result.consensusAchieved,
        summary: result.summary,
        agreementLevel: result.decisionEvent.outputs.agreementLevel,
        confidence: result.decisionEvent.confidence,
      }, null, 2));
    } else {
      console.log('='.repeat(60));
      console.log('CONSENSUS ANALYSIS SUMMARY');
      console.log('='.repeat(60));
      console.log();
      console.log(result.summary);
      console.log();
      console.log(`Execution Reference: ${result.decisionEvent.execution_ref}`);
      console.log(`Timestamp: ${result.decisionEvent.timestamp}`);
      console.log('='.repeat(60));
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Inspect command - inspect specific signals or results
 */
async function cmdInspect(flags: Record<string, string | boolean>): Promise<void> {
  const stdinData = await readStdin();

  if (!stdinData.trim()) {
    console.error('Error: No input provided. Pipe signal data to stdin.');
    process.exit(1);
  }

  try {
    const input = parseSignalInput(stdinData, flags);
    const signalId = flags['signal-id'];

    // If specific signal ID requested, filter and show details
    if (signalId && typeof signalId === 'string') {
      const signal = input.signals.find(s => s.signalId === signalId);

      if (!signal) {
        console.error(`Error: Signal with ID "${signalId}" not found`);
        process.exit(1);
      }

      console.log(formatOutput({
        signalId: signal.signalId,
        sourceLayer: signal.sourceLayer,
        value: signal.value,
        confidence: signal.confidence,
        timestamp: signal.timestamp,
        metadata: signal.metadata,
      }, flags['format'] || 'json'));

      process.exit(0);
    }

    // Otherwise, show divergent signals analysis
    const response = await handleConsensusRequest({ body: input });
    const result = JSON.parse(response.body);

    if (!result.success) {
      console.error('Error:', result.error?.message || 'Unknown error');
      process.exit(1);
    }

    const divergentSignals = result.decisionEvent.outputs.divergentSignals || [];

    console.log(formatOutput({
      totalSignals: result.decisionEvent.outputs.totalSignals,
      agreementCount: result.decisionEvent.outputs.agreementCount,
      divergentCount: divergentSignals.length,
      divergentSignals,
    }, flags['format'] || 'json'));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Health check command
 */
async function cmdHealth(): Promise<void> {
  const response = await healthCheck();
  const result = JSON.parse(response.body);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'healthy' ? 0 : 1);
}

/**
 * Show help
 */
function showHelp(): void {
  console.log(`
Consensus Agent CLI v${AGENT_VERSION}
Agent ID: ${AGENT_ID}

DESCRIPTION:
  Derive consensus views and agreement metrics across multiple analytical signals
  and DecisionEvents. Performs ANALYTICAL SYNTHESIS and CONSENSUS FORMATION.

USAGE:
  consensus-agent <command> [options]

COMMANDS:
  ${CLI_CONTRACT.commands.join('\n  ')}
  health    Check agent health status

FLAGS:
${Object.entries(CLI_CONTRACT.flags)
    .map(([flag, desc]) => `  ${flag.padEnd(25)} ${desc}`)
    .join('\n')}
  --help                     Show this help message

EXAMPLES:
  # Analyze consensus from stdin
  cat signals.json | consensus-agent analyze

  # Synthesize with high agreement threshold
  cat signals.json | consensus-agent synthesize --min-agreement 0.8

  # Get summary in human-readable format
  cat signals.json | consensus-agent summarize

  # Inspect divergent signals
  cat signals.json | consensus-agent inspect

  # Inspect specific signal
  cat signals.json | consensus-agent inspect --signal-id signal-123

  # Use specific aggregation method
  cat signals.json | consensus-agent analyze --method median

  # Filter by scope
  cat signals.json | consensus-agent analyze --scope observatory,costops

INPUT FORMAT:
  Expects JSON input via stdin with either:
  - An array of signals
  - An object with a "signals" array

  Each signal must have:
    signalId     - Unique identifier
    sourceLayer  - Source layer (e.g., "observatory", "costops")
    value        - Signal value (numeric or structured)
    confidence   - Confidence score (0-1)
    timestamp    - ISO timestamp
    metadata     - Optional metadata object

EXAMPLE INPUT:
  [
    {
      "signalId": "sig-001",
      "sourceLayer": "observatory",
      "value": 0.95,
      "confidence": 0.9,
      "timestamp": "2024-01-15T10:00:00Z"
    },
    {
      "signalId": "sig-002",
      "sourceLayer": "costops",
      "value": 0.92,
      "confidence": 0.85,
      "timestamp": "2024-01-15T10:01:00Z"
    }
  ]
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags['help'] || args.flags['h']) {
    showHelp();
    process.exit(0);
  }

  if (args.flags['version'] || args.flags['v']) {
    console.log(`${AGENT_ID} v${AGENT_VERSION}`);
    process.exit(0);
  }

  const command = args.command;

  switch (command) {
    case 'analyze':
      await cmdAnalyze(args.flags);
      break;
    case 'synthesize':
      await cmdSynthesize(args.flags);
      break;
    case 'summarize':
      await cmdSummarize(args.flags);
      break;
    case 'inspect':
      await cmdInspect(args.flags);
      break;
    case 'health':
      await cmdHealth();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "consensus-agent --help" for usage information.');
      process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main, parseArgs, parseSignalInput };
