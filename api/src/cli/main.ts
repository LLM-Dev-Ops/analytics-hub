#!/usr/bin/env node

/**
 * CLI Main Entry Point
 *
 * Routes CLI commands to the appropriate agent CLI modules.
 *
 * Usage:
 *   npx @analytics-hub/cli <command> [subcommand] [options]
 *
 * Examples:
 *   npx @analytics-hub/cli strategic-recommendation analyze --start-time 2024-01-01T00:00:00Z --end-time 2024-01-31T23:59:59Z
 *   npx @analytics-hub/cli strategic-recommendation summarize --limit 10 --format json
 *
 * @module cli/main
 */

import { program } from 'commander';

/**
 * Initialize main CLI program
 */
function initializeMainProgram(): void {
  program
    .name('@analytics-hub/cli')
    .description(
      'Analytics Hub CLI - Command-line interface for LLM Analytics Hub agents'
    )
    .version('1.0.0')
    .option(
      '--debug',
      'Enable debug logging',
      () => {
        process.env.DEBUG_CLI = 'true';
      }
    );

  /**
   * Strategic Recommendation subcommand
   */
  program
    .command('strategic-recommendation <cmd>')
    .alias('sr')
    .description('Strategic Recommendation Agent commands')
    .allowUnknownOption()
    .action(async (cmd) => {
      // Import and execute the strategic-recommendation CLI
      // This allows lazy-loading of the module
      const { default: strategicRecommendationCli } = await import(
        './strategic-recommendation'
      ).catch(() => {
        console.error(
          'Failed to load strategic-recommendation CLI module'
        );
        process.exit(1);
      });

      // Reconstruct argv for the subcommand
      const subargv = [
        process.argv[0],
        process.argv[1],
        cmd,
        ...process.argv.slice(4),
      ];

      // Re-invoke with subcommand argv
      process.argv = subargv;

      // Let the subcommand CLI handle it
      if (typeof strategicRecommendationCli === 'function') {
        strategicRecommendationCli();
      }
    });

  /**
   * Help command
   */
  program
    .command('help [command]')
    .description('Show help for a command')
    .action((cmd) => {
      if (cmd === 'strategic-recommendation' || cmd === 'sr') {
        console.log(`
Strategic Recommendation Agent CLI Commands:

  analyze    - Run strategic recommendation analysis
    Options:
      --start-time <datetime>        Start time (ISO 8601 format)
      --end-time <datetime>          End time (ISO 8601 format)
      --domains <list>               Comma-separated list of domains
      --focus-areas <list>           Comma-separated focus areas
      --output-format <format>       Output format (json|text)

    Example:
      npx @analytics-hub/cli strategic-recommendation analyze \\
        --start-time 2024-01-01T00:00:00Z \\
        --end-time 2024-01-31T23:59:59Z \\
        --output-format json

  summarize  - Get executive summary of recent insights
    Options:
      --limit <number>               Maximum recommendations (default: 5)
      --format <format>              Output format (json|text)

    Example:
      npx @analytics-hub/cli strategic-recommendation summarize --limit 10 --format text

  inspect    - View details of a specific recommendation
    Arguments:
      id                             Recommendation ID
    Options:
      --format <format>              Output format (json|text)

    Example:
      npx @analytics-hub/cli strategic-recommendation inspect <id> --format json

  list       - List recent recommendations
    Options:
      --limit <number>               Maximum recommendations (default: 10)
      --offset <number>              Pagination offset (default: 0)
      --start-time <datetime>        Filter by start time
      --end-time <datetime>          Filter by end time
      --format <format>              Output format (json|text)

    Example:
      npx @analytics-hub/cli strategic-recommendation list --limit 20 --format text
`);
      } else {
        program.outputHelp();
      }
    });

  /**
   * Version command
   */
  program
    .command('version')
    .description('Show version information')
    .action(() => {
      console.log('@analytics-hub/cli v1.0.0');
      console.log('Strategic Recommendation Agent CLI v1.0.0');
    });

  // Parse arguments
  program.parse(process.argv);

  // Show help if no command provided
  if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
  }
}

/**
 * Main entry point
 */
if (require.main === module) {
  initializeMainProgram();
}

export { initializeMainProgram };
