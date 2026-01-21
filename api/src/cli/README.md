# Analytics Hub CLI Module

Command-line interface (CLI) module for the Analytics Hub API. Provides command-line tools for interacting with various agents and analytics services.

## Overview

The CLI module provides a comprehensive command-line interface for the Analytics Hub, with specialized modules for different agent types. Currently includes:

- **Strategic Recommendation Agent CLI** - Analyze trends, generate recommendations, and view executive summaries

## Architecture

### File Structure

```
src/cli/
├── README.md                                  # This file
├── main.ts                                    # Main CLI entry point
├── strategic-recommendation.ts                # Strategic Recommendation Agent CLI
├── index.ts                                   # CLI module exports
└── __tests__/
    └── strategic-recommendation.test.ts       # Unit tests
```

### Design Patterns

The CLI module follows these patterns:

1. **Command Handler Pattern** - Each command has a dedicated handler function
2. **Configuration Injection** - Environment variables for configuration
3. **Telemetry Recording** - Automatic telemetry for all invocations
4. **Error Handling** - Comprehensive error handling with exit codes
5. **Output Formatting** - Support for multiple output formats (JSON, text)

## Strategic Recommendation CLI

### Features

- **analyze** - Run strategic recommendation analysis on time windows
  - Supports filtering by domains and focus areas
  - Configurable output formats (JSON, text)
  - Automatic signal aggregation and trend analysis

- **summarize** - Get executive summary of recent insights
  - Shows recommendation distribution by category and priority
  - Lists top recommendations with action items
  - Configurable result limit

- **inspect** - View details of a specific recommendation
  - Shows recommendation rationale and supporting data
  - Lists related recommendations
  - Provides implementation guidance

- **list** - List recommendations with pagination
  - Supports time range filtering
  - Pagination support (limit, offset)
  - Optional date filtering

### Usage

```bash
# Run analysis
npm run cli:sr -- analyze \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --output-format json

# Get summary
npm run cli:sr -- summarize --limit 10 --format text

# Inspect recommendation
npm run cli:sr -- inspect <recommendation-id> --format json

# List recommendations
npm run cli:sr -- list --limit 20 --offset 0 --format text
```

## Implementation Details

### Environment Variables

Configure the CLI using environment variables:

```bash
# API endpoint (default: http://localhost:3000)
ANALYTICS_HUB_API_URL=http://api.example.com:3000

# Telemetry file path (default: ./.analytics-telemetry)
ANALYTICS_HUB_TELEMETRY_PATH=~/.analytics/telemetry

# Cache directory path (default: ./.analytics-cache)
ANALYTICS_HUB_CACHE_PATH=~/.analytics/cache

# Output directory path (default: ./.analytics-output)
ANALYTICS_HUB_OUTPUT_PATH=~/.analytics/output

# Enable debug logging
DEBUG_CLI=true
```

### Exit Codes

The CLI uses standard Unix exit codes:

```typescript
enum EXIT_CODES {
  SUCCESS = 0,
  GENERAL_ERROR = 1,
  INVALID_INPUT = 2,
  NOT_FOUND = 3,
  TIMEOUT = 4,
  RATE_LIMITED = 5,
  SERVICE_UNAVAILABLE = 6,
}
```

### Telemetry

Each CLI invocation is automatically recorded with telemetry including:

- Unique invocation ID (UUID)
- Timestamp and command name
- Options passed to the command
- Start/end times and execution duration
- Exit code and any error messages
- Output format used

Telemetry is stored as JSON Lines format in:
```
${ANALYTICS_HUB_TELEMETRY_PATH}/cli-events.jsonl
```

### Output Formats

#### JSON Format

Deterministic, machine-readable JSON output suitable for programmatic processing:

```json
{
  "success": true,
  "recommendations": [...],
  "totalSignalsAnalyzed": 1245,
  "trendsIdentified": 18,
  "correlationsFound": 34,
  "overallConfidence": 0.82,
  "analysisMetadata": {...}
}
```

#### Text Format

Human-readable formatted output with clear section headers and visual hierarchy:

```
╔════════════════════════════════════════════════════════════╗
║          STRATEGIC RECOMMENDATION ANALYSIS REPORT           ║
╚════════════════════════════════════════════════════════════╝

Analysis Metadata:
  Time Window: 2024-01-01T00:00:00Z to 2024-01-31T23:59:59Z
  Layers Analyzed: observatory, cost-ops, governance
  Processing Duration: 2847ms

Analysis Summary:
  Total Signals Analyzed: 1245
  Trends Identified: 18
  Correlations Found: 34
  Overall Confidence: 82.0%

Recommendations (5 total):

1. Optimize LLM inference costs by implementing request batching
   ID: 550e8400-e29b-41d4-a716-446655440000
   Category: cost-optimization | Priority: high | Time Horizon: short-term
   Confidence: 87.0%
   Description: Analysis shows 40% of requests can be batched, reducing API calls by 35%
   Expected Impact:
     - Cost Savings: $15,000.00
     - Performance Gain: 12.0%
```

## Development

### Building

```bash
# Build TypeScript to JavaScript
npm run build

# Build with watches
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test
npm test -- --testNamePattern="strategic-recommendation"
```

### Code Style

```bash
# Lint
npm run lint

# Format code
npm run format
```

## Adding New CLI Commands

To add a new CLI command:

1. Create a new file in `src/cli/<command-name>.ts`:

```typescript
#!/usr/bin/env node

import { program } from 'commander';
import { v4 as uuidv4 } from 'uuid';

function handleCommand(options: any): void {
  const invocationId = uuidv4();

  // Implementation

  process.exit(0);
}

program
  .command('my-command')
  .description('Description')
  .option('--my-option <value>', 'Option description')
  .action(handleCommand);

program.parse(process.argv);
```

2. Export from `src/cli/index.ts`:

```typescript
export * from './my-command';
```

3. Add to `src/cli/main.ts` as a subcommand:

```typescript
program
  .command('my-command <cmd>')
  .alias('mc')
  .description('My Command commands')
  .allowUnknownOption()
  .action(async (cmd) => {
    // Router implementation
  });
```

4. Update `package.json` bin entries:

```json
{
  "bin": {
    "my-command": "./dist/cli/my-command.js"
  }
}
```

5. Add tests in `src/cli/__tests__/my-command.test.ts`

## Best Practices

### Error Handling

Always use appropriate exit codes:

```typescript
try {
  // Operation
  process.exit(EXIT_CODES.SUCCESS);
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);

  if (options.format === 'json') {
    console.error(JSON.stringify({ success: false, error: errorMsg }));
  } else {
    console.error(`Error: ${errorMsg}`);
  }

  process.exit(EXIT_CODES.GENERAL_ERROR);
}
```

### Telemetry Recording

Always record telemetry for each invocation:

```typescript
const invocationId = uuidv4();
const startTime = performance.now();

try {
  // Operation
  recordTelemetry({
    invocationId,
    timestamp: new Date().toISOString(),
    command: 'my-command',
    options,
    startTime,
    endTime: performance.now(),
    duration: performance.now() - startTime,
    exitCode: EXIT_CODES.SUCCESS,
    outputFormat: 'json',
  });
} catch (error) {
  recordTelemetry({
    invocationId,
    timestamp: new Date().toISOString(),
    command: 'my-command',
    options,
    startTime,
    endTime: performance.now(),
    duration: performance.now() - startTime,
    exitCode: EXIT_CODES.GENERAL_ERROR,
    error: errorMsg,
    outputFormat: 'json',
  });
}
```

### Output Consistency

Support both JSON and text formats consistently:

```typescript
if (format === 'json') {
  console.log(JSON.stringify(result, null, 2));
} else {
  outputText(result);
}
```

## Testing

### Running Tests

```bash
# Run all CLI tests
npm test src/cli/__tests__

# Run specific test file
npm test src/cli/__tests__/strategic-recommendation.test.ts

# Run with coverage
npm test -- --coverage src/cli/__tests__
```

### Test Structure

Tests follow standard Jest patterns:

```typescript
describe('Strategic Recommendation CLI', () => {
  describe('handleAnalyze', () => {
    it('should handle valid time range', async () => {
      // Test implementation
    });

    it('should validate time range ordering', async () => {
      // Test implementation
    });
  });
});
```

## Integration

### Using in Scripts

```bash
#!/bin/bash

# Get recommendations as JSON
RESULTS=$(npm run cli:sr -- list --limit 10 --format json)

# Process with jq
TOTAL=$(echo "$RESULTS" | jq '.total')
echo "Found $TOTAL recommendations"
```

### Using in CI/CD

```yaml
# GitHub Actions example
- name: Run analytics analysis
  run: |
    npm install
    npm run build
    npm run cli:sr -- analyze \
      --start-time ${{ env.START_TIME }} \
      --end-time ${{ env.END_TIME }} \
      --output-format json > analysis-report.json

- name: Upload report
  uses: actions/upload-artifact@v3
  with:
    name: analysis-report
    path: analysis-report.json
```

## Performance Considerations

- Large time windows (>90 days) may take longer to analyze
- Use `--focus-areas` to narrow analysis scope and improve performance
- Consider pagination for large result sets
- Results are cached when possible to reduce API load
- Telemetry recording is asynchronous and non-blocking

## Troubleshooting

### Connection Issues

```bash
# Check API server health
curl $ANALYTICS_HUB_API_URL/health

# Verify configuration
echo $ANALYTICS_HUB_API_URL
echo $ANALYTICS_HUB_TELEMETRY_PATH
```

### Enable Debug Output

```bash
DEBUG_CLI=true npm run cli:sr -- analyze \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z
```

### Check Telemetry

```bash
# View latest telemetry events
tail -f $ANALYTICS_HUB_TELEMETRY_PATH/cli-events.jsonl | jq '.'
```

## Documentation

See the main CLI documentation: [CLI.md](../../docs/CLI.md)

## License

Apache-2.0
