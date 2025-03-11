/**
 * Log Viewer Component for Web Interface
 * This is a reusable UI component for displaying logs
 */

/**
 * Create a log viewer element
 * @param {Object} options - Configuration options
 * @param {string} options.containerId - ID of container element
 * @param {Function} options.onDownload - Callback for download button
 * @param {Function} options.onClear - Callback for clear button
 * @param {Function} options.onLevelChange - Callback when log level changes
 * @param {string} options.defaultLevel - Default log level
 * @param {Array} options.logLevels - Available log levels
 * @returns {Object} Log viewer methods
 */
export function createLogViewer(options = {}) {
  const containerId = options.containerId || 'log-viewer';
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Container element with ID "${containerId}" not found`);
    return null;
  }
  
  // Log store
  const logs = [];
  const logLevels = options.logLevels || ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
  let currentLevel = options.defaultLevel || 'INFO';
  let autoScroll = true;
  
  // Create UI elements
  container.innerHTML = `
    <div class="log-viewer-container">
      <div class="log-viewer-header">
        <div class="log-viewer-title">Logs</div>
        <div class="log-viewer-controls">
          <label for="log-level">Level:</label>
          <select id="log-level" class="log-level-select">
            ${logLevels.map(level => 
    `<option value="${level}" ${level === currentLevel ? 'selected' : ''}>${level}</option>`
  ).join('')}
          </select>
          <label for="auto-scroll">
            <input type="checkbox" id="auto-scroll" checked> Auto-scroll
          </label>
          <button id="btn-clear-logs" class="log-btn">Clear</button>
          <button id="btn-download-logs" class="log-btn">Download</button>
        </div>
      </div>
      <div class="log-viewer-body">
        <div class="log-entries"></div>
      </div>
      <div class="log-viewer-footer">
        <div class="log-status">0 logs</div>
      </div>
    </div>
  `;
  
  // Apply styles
  const style = document.createElement('style');
  style.textContent = `
    .log-viewer-container {
      display: flex;
      flex-direction: column;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-family: monospace;
      height: 300px;
      background: #f8f8f8;
    }
    
    .log-viewer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid #ddd;
      background: #f0f0f0;
    }
    
    .log-viewer-title {
      font-weight: bold;
      font-size: 14px;
    }
    
    .log-viewer-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .log-level-select {
      padding: 4px;
      border-radius: 3px;
    }
    
    .log-btn {
      padding: 4px 8px;
      border-radius: 3px;
      background: #fff;
      border: 1px solid #ccc;
      cursor: pointer;
    }
    
    .log-btn:hover {
      background: #f0f0f0;
    }
    
    .log-viewer-body {
      flex: 1;
      overflow-y: auto;
      position: relative;
      background: #fff;
    }
    
    .log-entries {
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    .log-entry {
      padding: 4px 8px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
    }
    
    .log-entry:hover {
      background: rgba(0, 0, 0, 0.02);
    }
    
    .log-time {
      color: #888;
      margin-right: 8px;
      white-space: nowrap;
    }
    
    .log-level-badge {
      padding: 1px 4px;
      border-radius: 3px;
      margin-right: 8px;
      font-size: 10px;
      color: white;
      width: 40px;
      text-align: center;
      font-weight: bold;
    }
    
    .log-level-ERROR {
      background-color: #FF5252;
    }
    
    .log-level-WARN {
      background-color: #FFB74D;
    }
    
    .log-level-INFO {
      background-color: #4FC3F7;
    }
    
    .log-level-DEBUG {
      background-color: #9E9E9E;
    }
    
    .log-level-TRACE {
      background-color: #E0E0E0;
      color: #666;
    }
    
    .log-message {
      flex: 1;
    }
    
    .log-viewer-footer {
      padding: 4px 8px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #666;
      background: #f0f0f0;
    }
    
    .empty-logs {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #999;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
  
  // DOM references
  const elements = {
    logEntries: container.querySelector('.log-entries'),
    logLevelSelect: container.querySelector('#log-level'),
    autoScrollCheckbox: container.querySelector('#auto-scroll'),
    clearBtn: container.querySelector('#btn-clear-logs'),
    downloadBtn: container.querySelector('#btn-download-logs'),
    logStatus: container.querySelector('.log-status')
  };
  
  // Show empty state initially
  showEmptyState();
  
  // Event listeners
  elements.logLevelSelect.addEventListener('change', () => {
    currentLevel = elements.logLevelSelect.value;
    if (typeof options.onLevelChange === 'function') {
      options.onLevelChange(currentLevel);
    }
    renderLogs();
  });
  
  elements.autoScrollCheckbox.addEventListener('change', () => {
    autoScroll = elements.autoScrollCheckbox.checked;
    if (autoScroll) {
      scrollToBottom();
    }
  });
  
  elements.clearBtn.addEventListener('click', () => {
    logs.length = 0;
    renderLogs();
    if (typeof options.onClear === 'function') {
      options.onClear();
    }
  });
  
  elements.downloadBtn.addEventListener('click', () => {
    if (typeof options.onDownload === 'function') {
      options.onDownload();
    }
  });
  
  /**
   * Show empty state message
   */
  function showEmptyState() {
    elements.logEntries.innerHTML = '<div class="empty-logs">No logs to display</div>';
    updateLogCount();
  }
  
  /**
   * Update the log count in the footer
   */
  function updateLogCount() {
    const visibleCount = getVisibleLogs().length;
    const totalCount = logs.length;
    
    if (visibleCount === totalCount) {
      elements.logStatus.textContent = `${totalCount} log${totalCount !== 1 ? 's' : ''}`;
    } else {
      elements.logStatus.textContent = `${visibleCount} of ${totalCount} log${totalCount !== 1 ? 's' : ''} (filtered)`;
    }
  }
  
  /**
   * Format time for display
   * @param {string} isoTime - ISO timestamp
   * @returns {string} Formatted time
   */
  function formatDisplayTime(isoTime) {
    try {
      const date = new Date(isoTime);
      return date.toLocaleTimeString();
    } catch (e) {
      return isoTime;
    }
  }
  
  /**
   * Get visible logs based on current level
   * @returns {Array} Visible logs
   */
  function getVisibleLogs() {
    const levelIndex = logLevels.indexOf(currentLevel);
    if (levelIndex === -1) return [];
    
    return logs.filter(log => {
      const logLevelIndex = logLevels.indexOf(log.level);
      return logLevelIndex !== -1 && logLevelIndex <= levelIndex;
    });
  }
  
  /**
   * Render logs to the UI
   */
  function renderLogs() {
    const visibleLogs = getVisibleLogs();
    
    if (visibleLogs.length === 0) {
      showEmptyState();
      return;
    }
    
    elements.logEntries.innerHTML = '';
    
    visibleLogs.forEach(log => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      
      entry.innerHTML = `
        <div class="log-time">${formatDisplayTime(log.timestamp)}</div>
        <div class="log-level-badge log-level-${log.level}">${log.level}</div>
        <div class="log-message">${escapeHtml(log.message)}</div>
      `;
      
      elements.logEntries.appendChild(entry);
    });
    
    updateLogCount();
    
    if (autoScroll) {
      scrollToBottom();
    }
  }
  
  /**
   * Scroll to the bottom of the log container
   */
  function scrollToBottom() {
    elements.logEntries.parentElement.scrollTop = elements.logEntries.parentElement.scrollHeight;
  }
  
  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Add a log entry to the viewer
   * @param {Object} log - Log entry
   */
  function addLog(log) {
    logs.push(log);
    
    // Check if this log should be visible
    const logLevelIndex = logLevels.indexOf(log.level);
    const currentLevelIndex = logLevels.indexOf(currentLevel);
    
    if (logLevelIndex !== -1 && logLevelIndex <= currentLevelIndex) {
      // Add single entry instead of re-rendering everything
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      
      entry.innerHTML = `
        <div class="log-time">${formatDisplayTime(log.timestamp)}</div>
        <div class="log-level-badge log-level-${log.level}">${log.level}</div>
        <div class="log-message">${escapeHtml(log.message)}</div>
      `;
      
      // Remove empty state if it exists
      const emptyState = elements.logEntries.querySelector('.empty-logs');
      if (emptyState) {
        elements.logEntries.innerHTML = '';
      }
      
      elements.logEntries.appendChild(entry);
      
      if (autoScroll) {
        scrollToBottom();
      }
    }
    
    updateLogCount();
  }
  
  /**
   * Set the current log level
   * @param {string} level - Log level
   */
  function setLogLevel(level) {
    if (logLevels.includes(level)) {
      currentLevel = level;
      elements.logLevelSelect.value = level;
      renderLogs();
    }
  }
  
  // Return public API
  return {
    addLog,
    setLogLevel,
    renderLogs,
    scrollToBottom,
    clearLogs: () => {
      logs.length = 0;
      renderLogs();
    },
    getLogs: () => [...logs]
  };
}