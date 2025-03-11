/**
 * Browser-specific logger implementation
 * This provides logging capabilities in browser environments
 */

// Log levels
const LOG_LEVELS = {
  ERROR: { level: 0, label: 'ERROR', color: '#FF5252' }, // Red
  WARN: { level: 1, label: 'WARN', color: '#FFB74D' },  // Orange
  INFO: { level: 2, label: 'INFO', color: '#4FC3F7' },  // Blue
  DEBUG: { level: 3, label: 'DEBUG', color: '#9E9E9E' }, // Gray
  TRACE: { level: 4, label: 'TRACE', color: '#E0E0E0' }  // Light gray
};

// Export log levels for UI components
export const LOG_LEVELS_ARRAY = Object.keys(LOG_LEVELS);

/**
 * Browser logger class
 */
class BrowserLogger {
  /**
   * Create a new BrowserLogger instance
   * @param {Object} options - Logger options
   * @param {string} options.name - Logger name
   * @param {string} options.logLevel - Log level (ERROR, WARN, INFO, DEBUG, TRACE)
   * @param {boolean} options.captureConsole - Capture console.log, error, etc.
   * @param {function} options.onNewLog - Callback for new log entries (for UI updates)
   */
  constructor(options = {}) {
    this.name = options.name || 'browser-logger';
    this.logLevel = LOG_LEVELS[options.logLevel] || LOG_LEVELS.INFO;
    this.onNewLog = options.onNewLog;
    this.logs = [];
    
    // Optionally capture console methods
    if (options.captureConsole) {
      this._captureConsole();
    }
  }

  /**
   * Capture and redirect console methods
   * @private
   */
  _captureConsole() {
    // Store original console methods
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };

    // Keep a record of all console logs
    if (!console._logs) {
      console._logs = [];
    }

    // Override console.log
    console.log = (...args) => {
      // Call original method
      originalConsole.log(...args);
      
      // Add to logs
      this.info(args.map(arg => this._formatArgument(arg)).join(' '), { source: 'console.log' });
    };

    // Override console.info
    console.info = (...args) => {
      originalConsole.info(...args);
      this.info(args.map(arg => this._formatArgument(arg)).join(' '), { source: 'console.info' });
    };

    // Override console.warn
    console.warn = (...args) => {
      originalConsole.warn(...args);
      this.warn(args.map(arg => this._formatArgument(arg)).join(' '), { source: 'console.warn' });
    };

    // Override console.error
    console.error = (...args) => {
      originalConsole.error(...args);
      this.error(args.map(arg => this._formatArgument(arg)).join(' '), { source: 'console.error' });
    };

    // Override console.debug
    console.debug = (...args) => {
      originalConsole.debug(...args);
      this.debug(args.map(arg => this._formatArgument(arg)).join(' '), { source: 'console.debug' });
    };
  }

  /**
   * Format a console argument for logging
   * @param {*} arg - Console argument
   * @returns {string} Formatted argument
   * @private
   */
  _formatArgument(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return Object.prototype.toString.call(arg);
      }
    }
    return String(arg);
  }

  /**
   * Format a log entry
   * @param {Object} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @returns {Object} Formatted log entry
   * @private
   */
  _formatLogEntry(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    
    // Create log entry
    const entry = {
      id: Date.now() + Math.random().toString(36).substr(2, 5), // Generate unique ID
      timestamp,
      level: level.label,
      levelColor: level.color,
      name: this.name,
      message,
      data
    };

    // Format as text for display
    const textParts = [
      `[${timestamp}]`,
      `[${level.label}]`,
      `[${this.name}]`,
      message
    ];

    if (Object.keys(data).length > 0) {
      try {
        textParts.push(JSON.stringify(data));
      } catch (e) {
        textParts.push('[Complex data]');
      }
    }

    entry.text = textParts.join(' ');
    
    return entry;
  }

  /**
   * Log a message at a specific level
   * @param {Object} level - Log level object
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @private
   */
  _log(level, message, data = {}) {
    // Skip if log level is too high
    if (level.level > this.logLevel.level) return;

    const entry = this._formatLogEntry(level, message, data);
    this.logs.push(entry);

    // Call onNewLog callback if provided
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
  error(message, data = {}) {
    return this._log(LOG_LEVELS.ERROR, message, data);
  }

  /**
   * Log a warning message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  warn(message, data = {}) {
    return this._log(LOG_LEVELS.WARN, message, data);
  }

  /**
   * Log an info message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  info(message, data = {}) {
    return this._log(LOG_LEVELS.INFO, message, data);
  }

  /**
   * Log a debug message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  debug(message, data = {}) {
    return this._log(LOG_LEVELS.DEBUG, message, data);
  }

  /**
   * Log a trace message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  trace(message, data = {}) {
    return this._log(LOG_LEVELS.TRACE, message, data);
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
   * Generate a log report for downloading
   * @returns {Object} Log report object
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

  /**
   * Create a downloadable log file
   * @param {string} format - 'text' or 'json'
   * @returns {Blob} File blob for downloading
   */
  createDownloadableLog(format = 'text') {
    let content;
    let type;
    
    if (format === 'json') {
      content = JSON.stringify(this.getLogReport(), null, 2);
      type = 'application/json';
    } else {
      content = this.getLogsAsString();
      type = 'text/plain';
    }
    
    return new Blob([content], { type });
  }

  /**
   * Trigger download of logs
   * @param {string} format - 'text' or 'json'
   * @param {string} filename - Optional filename
   */
  downloadLogs(format = 'text', filename = '') {
    const blob = this.createDownloadableLog(format);
    const extension = format === 'json' ? '.json' : '.log';
    
    // Generate filename with timestamp if not provided
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `${this.name}_${timestamp}${extension}`;
    } else if (!filename.endsWith(extension)) {
      filename += extension;
    }
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}

/**
 * Create a browser logger instance
 * @param {Object} options - Logger options
 * @returns {BrowserLogger} Logger instance
 */
export function createBrowserLogger(options = {}) {
  return new BrowserLogger(options);
}