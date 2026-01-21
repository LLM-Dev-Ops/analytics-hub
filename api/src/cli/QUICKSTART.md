# Strategic Recommendation CLI - Quick Start Guide

Get started with the Strategic Recommendation Agent CLI in 5 minutes.

## Installation

The CLI is built into the Analytics Hub API package. No separate installation needed.

## Basic Usage

### 1. Run Analysis

Analyze data from the last 30 days:

```bash
npm run cli:sr -- analyze \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --output-format json
```

### 2. Get Executive Summary

View top 10 recommendations:

```bash
npm run cli:sr -- summarize --limit 10 --format text
```

### 3. Inspect a Recommendation

View details of a specific recommendation:

```bash
npm run cli:sr -- inspect <recommendation-id>
```

### 4. List All Recommendations

List recent recommendations:

```bash
npm run cli:sr -- list --limit 20 --format text
```

## Common Tasks

### Focus on Cost Optimization

```bash
npm run cli:sr -- analyze \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --focus-areas cost-optimization \
  --output-format json
```

### Process Results with jq

Get total estimated cost savings:

```bash
npm run cli:sr -- analyze \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --focus-areas cost-optimization \
  --output-format json | \
  jq '[.recommendations[].expectedImpact.costSavings // 0] | add'
```

### Export to CSV

Get recommendations in CSV format:

```bash
npm run cli:sr -- list --format json | \
  jq -r '.recommendations[] | [.recommendationId, .category, .priority, .title] | @csv' > recommendations.csv
```

## Environment Variables

Configure default settings:

```bash
# Use custom API endpoint
export ANALYTICS_HUB_API_URL=http://api.example.com:3000

# Store telemetry in custom location
export ANALYTICS_HUB_TELEMETRY_PATH=~/.analytics/telemetry

# Enable debug output
export DEBUG_CLI=true
```

## Output Formats

### JSON (Machine-readable)

```bash
npm run cli:sr -- summarize --format json
```

Perfect for automation and scripting. Output includes all data fields.

### Text (Human-readable)

```bash
npm run cli:sr -- summarize --format text
```

Formatted for display with boxes and alignment.

## Help and Documentation

```bash
# Show command help
npm run cli:sr -- --help

# Show help for specific command
npm run cli:sr -- analyze --help
npm run cli:sr -- summarize --help
npm run cli:sr -- inspect --help
npm run cli:sr -- list --help
```

## Tips

1. **Date Format**: Always use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)
   ```bash
   npm run cli:sr -- analyze \
     --start-time 2024-01-01T00:00:00Z \
     --end-time 2024-01-31T23:59:59Z
   ```

2. **Pagination**: Use limit and offset for large result sets
   ```bash
   npm run cli:sr -- list --limit 50 --offset 100
   ```

3. **Multiple Filters**: Combine focus areas with comma separation
   ```bash
   npm run cli:sr -- analyze \
     --start-time 2024-01-01T00:00:00Z \
     --end-time 2024-01-31T23:59:59Z \
     --focus-areas cost-optimization,performance-improvement
   ```

4. **Save Output**: Redirect to file
   ```bash
   npm run cli:sr -- analyze \
     --start-time 2024-01-01T00:00:00Z \
     --end-time 2024-01-31T23:59:59Z \
     --output-format json > analysis-report.json
   ```

5. **Pipe to Other Tools**: Use JSON output with jq, grep, etc.
   ```bash
   npm run cli:sr -- list --format json | jq '.recommendations | length'
   ```

## Troubleshooting

### Command not found
```bash
# Make sure you're in the api directory
cd /workspaces/analytics-hub/api

# Build if needed
npm run build
```

### Connection error
```bash
# Check API is running
curl http://localhost:3000/health

# Use custom API URL
export ANALYTICS_HUB_API_URL=http://your-api:3000
npm run cli:sr -- list
```

### Invalid date format
```bash
# Use ISO 8601 format
npm run cli:sr -- analyze \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z
```

## Examples

### Weekly Analysis

```bash
# Analyze last week
npm run cli:sr -- analyze \
  --start-time 2024-01-15T00:00:00Z \
  --end-time 2024-01-21T23:59:59Z \
  --format text
```

### Monthly Summary with Top 5

```bash
# Get top 5 recommendations for last month
npm run cli:sr -- summarize --limit 5 --format text
```

### Find Critical Issues

```bash
# List and filter for critical recommendations
npm run cli:sr -- list --limit 100 --format json | \
  jq '.recommendations[] | select(.priority == "critical")'
```

### Generate Report

```bash
# Create a multi-format report
echo "=== ANALYSIS REPORT ===" > report.txt
npm run cli:sr -- analyze \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --format text >> report.txt

echo "" >> report.txt
echo "=== SUMMARY ===" >> report.txt
npm run cli:sr -- summarize --format text >> report.txt

cat report.txt
```

## Next Steps

- Read the [full documentation](../../docs/CLI.md)
- Check [developer guide](./README.md)
- Run tests: `npm test src/cli/__tests__`
- Build: `npm run build`

## Getting Help

For issues or questions:
1. Check the [troubleshooting guide](../../docs/CLI.md#troubleshooting)
2. Enable debug output: `DEBUG_CLI=true npm run cli:sr -- ...`
3. Review the [full documentation](../../docs/CLI.md)
4. Check the test files for usage examples
