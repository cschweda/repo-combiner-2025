// Import the repo-combiner module
import { createRepoCombiner } from '../../src/repo-combiner.js';

// DOM elements
const repoUrlInput = document.getElementById('repoUrl');
const formatSelect = document.getElementById('format');
const processButton = document.getElementById('processButton');
const progressBar = document.querySelector('.progress');
const progressBarFill = document.querySelector('.progress-bar-fill');
const statusText = document.querySelector('.status');
const loadingElement = document.getElementById('loading');
const outputContainer = document.getElementById('outputContainer');
const outputElement = document.getElementById('output');
const copyButton = document.getElementById('copyButton');
const downloadButton = document.getElementById('downloadButton');
const errorMessage = document.getElementById('errorMessage');

// Store the result
let result = null;

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

  // Validate repository URL
  if (!repoUrl || !repoUrl.includes('github.com')) {
    showError('Please enter a valid GitHub repository URL');
    return;
  }

  // Reset UI
  resetUI();

  // Show loading
  loadingElement.style.display = 'block';

  try {
    // Get authentication details
    const authType = authTypeSelect.value;
    const auth = {};

    if (authType === 'token') {
      const token = document.getElementById('githubToken').value.trim();
      if (token) {
        auth.token = token;
      } else {
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
      } else {
        showError(
          'Please enter both username and password or select a different authentication method'
        );
        loadingElement.style.display = 'none';
        return;
      }
    }

    // Create repo combiner with selected options
    const repoCombiner = createRepoCombiner({
      format,
      auth,
      // Add custom event listener for progress updates
      onProgress: updateProgress,
    });

    // Process repository
    result = await repoCombiner.processRepo(repoUrl);

    // Display the result based on format
    displayResult(result, format);
  } catch (error) {
    console.error('Error processing repository:', error);
    showError(`Error processing repository: ${error.message}`);
  } finally {
    // Hide loading
    loadingElement.style.display = 'none';
  }
});

// Update progress
function updateProgress(status) {
  progressBar.style.display = 'block';
  statusText.textContent = status.message || 'Processing...';

  if (status.progress !== undefined) {
    progressBarFill.style.width = `${status.progress * 100}%`;
  }
}

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

// Display result based on format
function displayResult(data, format) {
  // Show output container
  outputContainer.style.display = 'block';

  // Add token assessment if we have JSON data with stats
  let tokenInfo = '';
  if (format === 'json' && typeof data === 'object' && data.stats && data.stats.totalTokens) {
    const tokenCount = data.stats.totalTokens;
    const assessment = getTokenAssessment(tokenCount);
    tokenInfo = `
      <div class="token-assessment">
        <h3>Token Assessment</h3>
        <p><strong>Total Tokens:</strong> ${tokenCount.toLocaleString()}</p>
        <p><strong>Assessment:</strong> ${assessment}</p>
      </div>
    `;
  }

  // Display based on format
  if (format === 'json') {
    // JSON format
    outputElement.innerHTML = tokenInfo + `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  } else if (format === 'markdown') {
    // Markdown format using marked.js
    if (window.marked) {
      outputElement.innerHTML = tokenInfo + window.marked.parse(data);
    } else {
      outputElement.innerHTML = tokenInfo + `<pre>${data}</pre>`;
    }
  } else {
    // Text format
    outputElement.innerHTML = tokenInfo + `<pre>${data}</pre>`;
  }
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
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

// Reset UI
function resetUI() {
  errorMessage.style.display = 'none';
  progressBar.style.display = 'none';
  progressBarFill.style.width = '0%';
  statusText.textContent = 'Processing repository...';
  outputContainer.style.display = 'none';
  outputElement.innerHTML = '';
}
