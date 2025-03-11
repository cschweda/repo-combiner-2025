import './style.css';
import { marked } from 'marked';
import { createRepoCombiner } from './browser-repo-combiner';
import { createBrowserLogger } from './browser-logger';
import { createLogViewer } from './log-viewer';

// Initialize logger
const logger = createBrowserLogger({
  name: 'repo-combiner-web',
  logLevel: 'INFO',
  captureConsole: true
});

// Create log viewer
const logViewer = createLogViewer({
  containerId: 'log-viewer',
  logLevels: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'],
  defaultLevel: 'INFO',
  onDownload: () => {
    logger.downloadLogs('text', `repo-combiner-logs-${new Date().toISOString().replace(/:/g, '-')}.log`);
  },
  onClear: () => {
    logger.info('Logs cleared by user');
  },
  onLevelChange: (level) => {
    logger.info(`Log level changed to ${level}`);
  }
});

// Connect logger to log viewer
logger.onNewLog = (entry) => {
  if (logViewer) {
    logViewer.addLog(entry);
  }
};

// Log application initialization
logger.info('Repo Combiner web application initialized', {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent
});

// DOM elements
const repoUrlInput = document.getElementById('repoUrl');
const formatSelect = document.getElementById('format');
const processButton = document.getElementById('processButton');
const progressBar = document.querySelector('.progress');
const progressBarFill = document.querySelector('.progress-bar-fill');
const statusText = document.querySelector('.status');
const loadingElement = document.querySelector('.loading');
const outputContainer = document.querySelector('.output-container');
const outputElement = document.getElementById('output');
const copyButton = document.getElementById('copyButton');
const downloadButton = document.getElementById('downloadButton');
const errorMessage = document.querySelector('.error');

// Store the result and repoCombiner instance
let result = null;
let repoCombiner = null;

// Auth type selector
const authTypeSelect = document.getElementById('authType');
const tokenAuthDiv = document.getElementById('tokenAuth');
const basicAuthDiv = document.getElementById('basicAuth');

// Toggle authentication fields based on selection
authTypeSelect.addEventListener('change', () => {
  const authType = authTypeSelect.value;
  tokenAuthDiv.style.display = authType === 'token' ? 'block' : 'none';
  basicAuthDiv.style.display = authType === 'basic' ? 'block' : 'none';
});

// Process repository button click handler
processButton.addEventListener('click', async () => {
  const repoUrl = repoUrlInput.value.trim();
  const format = formatSelect.value;

  logger.info('Process button clicked', { repoUrl, format });

  // Validate repository URL
  if (!repoUrl || !repoUrl.includes('github.com')) {
    logger.warn('Invalid repository URL', { repoUrl });
    showError('Please enter a valid GitHub repository URL');
    return;
  }

  // Reset UI
  resetUI();
  logger.debug('UI reset');

  // Show loading
  loadingElement.style.display = 'block';
  logger.debug('Loading indicator displayed');

  try {
    // Get authentication details
    const authType = authTypeSelect.value;
    const auth = {};
    logger.debug('Authentication method selected', { authType });

    if (authType === 'token') {
      const token = document.getElementById('githubToken').value.trim();
      if (token) {
        auth.token = token;
        logger.info('Using token authentication', { tokenLength: token.length });
      } else {
        logger.warn('Token authentication selected but no token provided');
        showError('Please enter a GitHub token or select a different authentication method');
        loadingElement.style.display = 'none';
        return;
      }
    } else if (authType === 'basic') {
      const username = document.getElementById('githubUsername').value.trim();
      const password = document.getElementById('githubPassword').value.trim();

      if (username && password) {
        auth.username = username;
        auth.password = password;
        logger.info('Using basic authentication', { username });
      } else {
        logger.warn('Basic authentication selected but credentials incomplete');
        showError(
          'Please enter both username and password or select a different authentication method'
        );
        loadingElement.style.display = 'none';
        return;
      }
    }

    // Create repo combiner with selected options
    logger.info('Creating RepoCombiner instance', { format, hasAuth: !!auth.token || !!(auth.username && auth.password) });
    repoCombiner = createRepoCombiner({
      format,
      auth,
      // Add custom event listener for progress updates
      onProgress: (status) => {
        updateProgress(status);
        
        // Log progress with appropriate level
        if (status.phase === 'error') {
          logger.error(status.message, { status });
        } else if (status.phase === 'initializing' || status.phase === 'complete') {
          logger.info(status.message, { 
            phase: status.phase,
            progress: status.progress
          });
        } else {
          logger.debug(status.message, { 
            phase: status.phase,
            progress: status.progress,
            stats: status.stats ? {
              totalFiles: status.stats.totalFiles,
              totalSize: status.stats.totalSize,
              totalTokens: status.stats.totalTokens
            } : undefined
          });
        }
      },
    });

    // Process repository
    logger.info('Starting repository processing', { repoUrl, format });
    result = await repoCombiner.processRepo(repoUrl);

    // Log completion
    logger.info('Repository processing completed successfully', {
      repoUrl,
      format,
      stats: repoCombiner.stats ? {
        totalFiles: repoCombiner.stats.totalFiles,
        totalSize: repoCombiner.stats.totalSize,
        totalTokens: repoCombiner.stats.totalTokens,
        elapsedTime: repoCombiner.stats.elapsedTime
      } : undefined
    });

    // Display the result based on format
    displayResult(result, format);
  } catch (error) {
    // Log the error
    logger.error('Error processing repository', {
      error: error.message,
      stack: error.stack,
      repoUrl,
      format
    });
    
    console.error('Error processing repository:', error);
    
    // Handle proxy server connection issues
    if (error.message.includes('proxy server') || error.message.includes('Could not connect to proxy')) {
      logger.error('Proxy server connection error', { error: error.message });
      showError(`
        <div class="error-details">
          <h3>Proxy Server Connection Error</h3>
          <p>${error.message}</p>
          <h4>How to Fix:</h4>
          <ol>
            <li>Make sure the proxy server is running: <code>npm run proxy</code></li>
            <li>Or use the combined command: <code>npm start</code></li>
            <li>Verify the proxy server URL is correct (default: http://localhost:3010)</li>
            <li>Check if another application is using port 3010</li>
          </ol>
        </div>
      `);
    }
    // Handle GitHub API rate limit errors
    else if (error.message.includes('API rate limit exceeded') || error.message.includes('rate limit will reset')) {
      logger.error('GitHub API rate limit exceeded', { error: error.message });
      showError(`
        <div class="error-details">
          <h3>GitHub API Rate Limit Exceeded</h3>
          <p>${error.message}</p>
          <h4>How to Fix:</h4>
          <ol>
            <li>Use the Authentication section above to provide a GitHub personal access token</li>
            <li>Click the dropdown next to "Authentication Method" and select "Personal Access Token"</li>
            <li>Enter your token in the field provided</li>
            <li>Try processing the repository again</li>
          </ol>
          <p><strong>Need a token?</strong> Create one at <a href="https://github.com/settings/tokens" target="_blank">GitHub Token Settings</a></p>
        </div>
      `);
    } else if (error.message.includes('Access denied by GitHub API')) {
      logger.error('GitHub API access denied', { error: error.message });
      showError(`
        <div class="error-details">
          <h3>GitHub API Access Error</h3>
          <p>${error.message}</p>
        </div>
      `);
    } else if (error.message.includes('Repository not found')) {
      logger.error('Repository not found', { error: error.message, repoUrl });
      showError(`
        <div class="error-details">
          <h3>Repository Not Found</h3>
          <p>${error.message}</p>
          <p>Please check that:</p>
          <ul>
            <li>The repository URL is correct</li>
            <li>The repository exists and is accessible</li>
            <li>For private repositories, you have provided proper authentication</li>
          </ul>
        </div>
      `);
    } else {
      // General error handling
      logger.error('Unhandled error', { error: error.message });
      showError(`Error processing repository: ${error.message}`);
    }
  } finally {
    // Hide loading
    loadingElement.style.display = 'none';
    logger.debug('Loading indicator hidden');
  }
});

// Get token assessment
function getTokenAssessment(tokenCount) {
  if (tokenCount < 1000) {
    return 'Very small document, will fit easily in any chat window.';
  } else if (tokenCount < 4000) {
    return 'Small document, should fit in most chat windows without issues.';
  } else if (tokenCount < 8000) {
    return 'Medium size document, may approach limits of some basic chat interfaces.';
  } else if (tokenCount < 16000) {
    return 'Large document, likely exceeds capacity of basic chat interfaces.';
  } else {
    return 'Very large document, exceeds capacity of most chat interfaces.';
  }
}

// Update progress
function updateProgress(status) {
  // Always show progress bar
  progressBar.style.display = 'block';
  
  // Set message with phase context
  let messagePrefix = '';
  if (status.phase) {
    switch(status.phase) {
      case 'initializing': 
        messagePrefix = '🔍 '; 
        break;
      case 'processing': 
        messagePrefix = '📝 '; 
        break;
      case 'generating': 
        messagePrefix = '📊 '; 
        break;
      case 'complete': 
        messagePrefix = '✅ '; 
        break;
      case 'error': 
        messagePrefix = '❌ '; 
        break;
    }
  }
  
  statusText.textContent = messagePrefix + (status.message || 'Processing...');

  // Update progress bar if progress is provided
  if (status.progress !== undefined) {
    const percent = Math.min(Math.max(status.progress * 100, 0), 100); // Ensure between 0-100
    progressBarFill.style.width = `${percent}%`;
    
    // Add percentage to status if not a complete message
    if (status.phase !== 'complete' && status.phase !== 'error') {
      statusText.textContent += ` (${Math.round(percent)}%)`;
    }
  }
  
  // Log to console for debugging
  console.log(`[${status.phase || 'progress'}] ${status.message}`);
}

// Display result based on format
function displayResult(data, format) {
  // Show output container
  outputContainer.style.display = 'block';

  // Get token info and stats depending on the format
  let tokenCount = 0;
  let totalFiles = 0;
  let totalSize = 0;
  let totalLines = 0;
  let skippedFiles = 0;
  let corsErrors = 0;
  
  if (format === 'json' && typeof data === 'object' && data.stats) {
    // Extract stats directly from JSON result
    tokenCount = data.stats.totalTokens || 0;
    totalFiles = data.stats.totalFiles || 0;
    totalSize = data.stats.totalSize || 0;
    skippedFiles = data.stats.skippedFiles || 0;
    totalLines = Array.isArray(data.files) 
      ? data.files.reduce((sum, file) => sum + (file.lines || 0), 0) 
      : 0;
  } else if (repoCombiner && repoCombiner.stats) {
    // For text/markdown formats, get stats from repoCombiner object
    tokenCount = repoCombiner.stats.totalTokens || 0;
    totalFiles = repoCombiner.stats.totalFiles || 0;
    totalSize = repoCombiner.stats.totalSize || 0;
    skippedFiles = repoCombiner.stats.skippedFiles || 0;
    
    // Count files and compute total lines safely
    if (repoCombiner.files && Array.isArray(repoCombiner.files)) {
      totalLines = repoCombiner.files.reduce((sum, file) => sum + (file.lines || 0), 0);
    }
    
    // Count CORS errors in logs
    if (console._logs) {
      corsErrors = console._logs.filter(log => 
        log.includes('CORS') || log.includes('blocked by CORS')
      ).length;
    }
  }
  
  // Format for display
  const sizeFormatted = formatFileSize(totalSize);
  const assessment = getTokenAssessment(tokenCount);
  
  // Check if we had CORS errors
  const corsWarning = corsErrors > 0 ? 
    `<div class="cors-warning">
      <p><strong>Note:</strong> ${corsErrors} file(s) couldn't be fetched due to CORS restrictions. 
      In a production environment, you would need a server-side proxy to fetch these files.</p>
    </div>` : '';
  
  // Create token assessment HTML
  const tokenInfo = `
    <div class="token-assessment">
      <h3>Repository Summary</h3>
      ${corsWarning}
      <p><strong>Files Processed:</strong> ${totalFiles.toLocaleString()}</p>
      <p><strong>Files Skipped:</strong> ${skippedFiles.toLocaleString()}</p>
      <p><strong>Total Size:</strong> ${sizeFormatted}</p>
      <p><strong>Total Lines:</strong> ${totalLines.toLocaleString()}</p>
      <p><strong>Total Tokens:</strong> ${tokenCount.toLocaleString()}</p>
      <p><strong>Assessment:</strong> ${assessment}</p>
    </div>
  `;

  // Display based on format
  if (format === 'json') {
    // JSON format
    outputElement.innerHTML = tokenInfo + `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  } else if (format === 'markdown') {
    // Markdown format using marked
    outputElement.innerHTML = tokenInfo + marked.parse(data);
  } else {
    // Text format
    outputElement.innerHTML = tokenInfo + `<pre>${data}</pre>`;
  }
}

// Format file size helper
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Copy button click handler
copyButton.addEventListener('click', () => {
  const format = formatSelect.value;
  let textToCopy;

  if (format === 'json' && typeof result === 'object') {
    textToCopy = JSON.stringify(result, null, 2);
  } else {
    textToCopy = result;
  }

  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      const originalText = copyButton.textContent;
      copyButton.textContent = 'Copied!';
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy: ', err);
    });
});

// Download button click handler
downloadButton.addEventListener('click', () => {
  const format = formatSelect.value;
  const repoName = getRepoNameFromUrl(repoUrlInput.value.trim());

  let content;
  let filename;
  let type;

  if (format === 'json') {
    content = JSON.stringify(result, null, 2);
    filename = `${repoName}.json`;
    type = 'application/json';
  } else if (format === 'markdown') {
    content = result;
    filename = `${repoName}.md`;
    type = 'text/markdown';
  } else {
    content = result;
    filename = `${repoName}.txt`;
    type = 'text/plain';
  }

  // Create blob and download
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Clean up
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Extract repository name from URL
function getRepoNameFromUrl(url) {
  try {
    const parts = url.split('/');
    return parts[parts.length - 1].replace('.git', '');
  } catch (error) {
    return 'repository';
  }
}

// Show error message
function showError(message) {
  errorMessage.innerHTML = message;
  errorMessage.style.display = 'block';
  errorMessage.classList.add('error-box');
  
  // Scroll to error message
  errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Reset UI
function resetUI() {
  errorMessage.style.display = 'none';
  progressBar.style.display = 'none';
  progressBarFill.style.width = '0%';
  statusText.textContent = 'Processing repository...';
  outputContainer.style.display = 'none';
  outputElement.innerHTML = '';
  repoCombiner = null; // Reset repoCombiner instance
  result = null; // Reset result
  
  logger.debug('UI has been reset');
}

// Add log toggle button functionality
const toggleLogButton = document.getElementById('toggleLogButton');
const logViewerContainer = document.getElementById('log-viewer-container');

toggleLogButton.addEventListener('click', () => {
  if (logViewerContainer.style.display === 'none' || !logViewerContainer.style.display) {
    logViewerContainer.style.display = 'block';
    toggleLogButton.textContent = 'Hide Logs';
    logger.info('Log viewer shown');
    
    // Make sure the newest logs are visible
    if (logViewer) {
      logViewer.scrollToBottom();
    }
  } else {
    logViewerContainer.style.display = 'none';
    toggleLogButton.textContent = 'Show Logs';
    logger.info('Log viewer hidden');
  }
});