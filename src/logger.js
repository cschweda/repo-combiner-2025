/**
 * Logging utility for repo-combiner
 * Provides a unified logging interface for both CLI and browser environments
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get project root path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const DEFAULT_LOG_DIR = path.join(projectRoot, 'logs');

// Log levels with color codes (for CLI)
const LOG_LEVELS = {
  ERROR: { level: 0, label: 'ERROR', color: '\x1b[31m' }, // Red
  WARN: { level: 1, label: 'WARN', color: '\x1b[33m' },  // Yellow
  INFO: { level: 2, label: 'INFO', color: '\x1b[36m' },  // Cyan
  DEBUG: { level: 3, label: 'DEBUG', color: '\x1b[90m' }, // Gray
  TRACE: { level: 4, label: 'TRACE', color: '\x1b[37m' }  // White
};

/**
 * Logger class that handles both file and console logging
 */
class Logger {
  /**
   * Create a new Logger instance
   * @param {Object} options - Logger options
   * @param {string} options.name - Logger name
   * @param {string} options.logDir - Directory for log files 
   * @param {string} options.logLevel - Log level (ERROR, WARN, INFO, DEBUG, TRACE)
   * @param {boolean} options.enableConsole - Enable console logging
   * @param {boolean} options.enableFileLogging - Enable file logging
   * @param {function} options.onNewLog - Callback for new log entries (for browser UI)
   */
  constructor(options = {}) {
    this.name = options.name || 'repo-combiner';
    this.logDir = options.logDir || DEFAULT_LOG_DIR;
    this.logLevel = LOG_LEVELS[options.logLevel] || LOG_LEVELS.INFO;
    this.enableConsole = options.enableConsole !== false;
    this.enableFileLogging = options.enableFileLogging !== false;
    this.onNewLog = options.onNewLog;
    this.logs = [];
    this.consoleResetCode = '\x1b[0m'; // Reset color code
    this.filePath = '';
    
    // Set up log file path with timestamp
    if (this.enableFileLogging) {
      this._setupLogFile();
    }
  }

  /**
   * Set up log file with timestamp
   * @private
   */
  async _setupLogFile() {
    const timestamp = this._getFormattedDateTime();
    this.filePath = path.join(this.logDir, `${this.name}_${timestamp}.log`);
    
    try {
      // Ensure log directory exists
      await fs.mkdir(this.logDir, { recursive: true });
      
      // Write initial log header
      await fs.writeFile(
        this.filePath, 
        `=== ${this.name.toUpperCase()} LOG STARTED AT ${new Date().toISOString()} ===\n`, 
        { flag: 'w' }
      );
    } catch (error) {
      console.error(`Failed to initialize log file: ${error.message}`);
      this.enableFileLogging = false;
    }
  }

  /**
   * Format a datetime string (YYYY-MM-DD_HH-MM-SS)
   * @returns {string} Formatted datetime
   * @private
   */
  _getFormattedDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

  /**
   * Format a log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data to log
   * @returns {Object} Formatted log entry
   * @private
   */
  _formatLogEntry(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level: level.label,
      name: this.name,
      message,
      data
    };

    // Format for text output
    const textParts = [
      `[${timestamp}]`,
      `[${level.label}]`,
      `[${this.name}]`,
      message
    ];

    if (Object.keys(data).length > 0) {
      textParts.push(JSON.stringify(data));
    }

    entry.text = textParts.join(' ');
    
    // Add color for console
    if (this.enableConsole) {
      entry.coloredText = `${level.color}${entry.text}${this.consoleResetCode}`;
    }

    return entry;
  }

  /**
   * Write log entry to file
   * @param {Object} entry - Log entry
   * @private
   */
  async _writeToFile(entry) {
    if (!this.enableFileLogging || !this.filePath) return;

    try {
      await fs.appendFile(this.filePath, entry.text + '\n');
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }

  /**
   * Log a message at a specific level
   * @param {Object} level - Log level object
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @private
   */
  async _log(level, message, data = {}) {
    // Skip if log level is too high
    if (level.level > this.logLevel.level) return;

    const entry = this._formatLogEntry(level, message, data);
    this.logs.push(entry);

    // Console output if enabled
    if (this.enableConsole) {
      console.log(entry.coloredText);
    }

    // File output if enabled
    if (this.enableFileLogging) {
      await this._writeToFile(entry);
    }

    // Callback for browser UI
    if (typeof this.onNewLog === 'function') {
      this.onNewLog(entry);
    }

    return entry;
  }

  /**
   * Set current log level
   * @param {string} level - Log level name (ERROR, WARN, INFO, DEBUG, TRACE)
   */
  setLogLevel(level) {
    if (LOG_LEVELS[level]) {
      this.logLevel = LOG_LEVELS[level];
      this.info(`Log level set to ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}`);
    }
  }

  /**
   * Log an error message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  async error(message, data = {}) {
    return await this._log(LOG_LEVELS.ERROR, message, data);
  }

  /**
   * Log a warning message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  async warn(message, data = {}) {
    return await this._log(LOG_LEVELS.WARN, message, data);
  }

  /**
   * Log an info message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  async info(message, data = {}) {
    return await this._log(LOG_LEVELS.INFO, message, data);
  }

  /**
   * Log a debug message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  async debug(message, data = {}) {
    return await this._log(LOG_LEVELS.DEBUG, message, data);
  }

  /**
   * Log a trace message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  async trace(message, data = {}) {
    return await this._log(LOG_LEVELS.TRACE, message, data);
  }

  /**
   * Get all logs as array
   * @returns {Array} Array of log entries
   */
  getAllLogs() {
    return [...this.logs];
  }

  /**
   * Get logs as a downloadable string
   * @returns {string} All logs as string
   */
  getLogsAsString() {
    return this.logs.map(log => log.text).join('\n');
  }

  /**
   * Get path to current log file
   * @returns {string} Log file path
   */
  getLogFilePath() {
    return this.filePath;
  }

  /**
   * Generate a log report for saving/downloading
   * @returns {Object} Log report with metadata and entries
   */
  getLogReport() {
    return {
      name: this.name,
      generatedAt: new Date().toISOString(),
      logCount: this.logs.length,
      logs: this.logs.map(log => ({
        timestamp: log.timestamp,
        level: log.level,
        message: log.message,
        data: log.data
      }))
    };
  }
}

/**
 * Create a logger instance
 * @param {Object} options - Logger options
 * @returns {Logger} Logger instance
 */
export function createLogger(options = {}) {
  return new Logger(options);
}

// For browser environments
export const LOG_LEVELS_ARRAY = Object.keys(LOG_LEVELS);