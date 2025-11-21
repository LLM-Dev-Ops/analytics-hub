//! Output formatting utilities for CLI
//!
//! Provides consistent, colored output across all commands with support
//! for JSON output mode for automation.

use colored::Colorize;
use comfy_table::{modifiers::UTF8_ROUND_CORNERS, presets::UTF8_FULL, Cell, Table};
use serde::{Deserialize, Serialize};

/// Output format for CLI commands
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    /// Human-readable colored output
    Human,
    /// JSON output for automation
    Json,
}

impl Default for OutputFormat {
    fn default() -> Self {
        Self::Human
    }
}

/// Result structure for JSON output
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandOutput {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<String>,
}

impl CommandOutput {
    /// Create a successful output
    pub fn success(message: impl Into<String>) -> Self {
        Self {
            success: true,
            message: message.into(),
            data: None,
            errors: Vec::new(),
        }
    }

    /// Create a successful output with data
    pub fn success_with_data(message: impl Into<String>, data: serde_json::Value) -> Self {
        Self {
            success: true,
            message: message.into(),
            data: Some(data),
            errors: Vec::new(),
        }
    }

    /// Create a failed output
    pub fn failure(message: impl Into<String>, errors: Vec<String>) -> Self {
        Self {
            success: false,
            message: message.into(),
            data: None,
            errors,
        }
    }

    /// Create a failed output with data
    pub fn failure_with_data(message: impl Into<String>, data: serde_json::Value) -> Self {
        Self {
            success: false,
            message: message.into(),
            data: Some(data),
            errors: Vec::new(),
        }
    }

    /// Output as JSON to stdout
    pub fn output_json(&self) {
        if let Ok(json) = serde_json::to_string_pretty(self) {
            println!("{}", json);
        }
    }
}

/// Print success message with green checkmark
pub fn print_success(msg: &str) {
    println!("{} {}", "✓".green().bold(), msg.green());
}

/// Print error message with red X
pub fn print_error(msg: &str) {
    eprintln!("{} {}", "✗".red().bold(), msg.red());
}

/// Print warning message with yellow warning symbol
pub fn print_warning(msg: &str) {
    println!("{} {}", "⚠".yellow().bold(), msg.yellow());
}

/// Print info message with blue info symbol
pub fn print_info(msg: &str) {
    println!("{} {}", "ℹ".blue().bold(), msg);
}

/// Print step message for multi-step operations
pub fn print_step(step: usize, total: usize, msg: &str) {
    println!(
        "{} {} {}",
        format!("[{}/{}]", step, total).cyan().bold(),
        "➜".cyan(),
        msg
    );
}

/// Print section header
pub fn print_header(msg: &str) {
    println!("\n{}", msg.bold().underline());
}

/// Print subsection header
pub fn print_subheader(msg: &str) {
    println!("\n{}", msg.bold());
}

/// Create a formatted table for displaying data
pub struct FormattedTable {
    table: Table,
}

impl FormattedTable {
    /// Create a new table with headers
    pub fn new(headers: Vec<&str>) -> Self {
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .apply_modifier(UTF8_ROUND_CORNERS);

        let header_cells: Vec<Cell> = headers
            .into_iter()
            .map(|h| Cell::new(h).fg(comfy_table::Color::Cyan))
            .collect();
        table.set_header(header_cells);

        Self { table }
    }

    /// Add a row to the table
    pub fn add_row(&mut self, row: Vec<String>) {
        self.table.add_row(row);
    }

    /// Print the table
    pub fn print(&self) {
        println!("{}", self.table);
    }
}

/// Print a key-value pair
pub fn print_kv(key: &str, value: &str) {
    println!("  {} {}", format!("{}:", key).bold(), value);
}

/// Print a bulleted list item
pub fn print_bullet(msg: &str) {
    println!("  {} {}", "•".cyan(), msg);
}

/// Print dry-run message
pub fn print_dry_run(msg: &str) {
    println!("{} {}", "[DRY RUN]".yellow().bold(), msg.yellow());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_output_success() {
        let output = CommandOutput::success("Operation completed");
        assert!(output.success);
        assert_eq!(output.message, "Operation completed");
        assert!(output.errors.is_empty());
    }

    #[test]
    fn test_command_output_failure() {
        let output = CommandOutput::failure(
            "Operation failed",
            vec!["Error 1".to_string(), "Error 2".to_string()],
        );
        assert!(!output.success);
        assert_eq!(output.errors.len(), 2);
    }

    #[test]
    fn test_formatted_table_creation() {
        let table = FormattedTable::new(vec!["Name", "Status", "Age"]);
        // Table creation should not panic
        assert!(true);
    }
}
