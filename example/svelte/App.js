import { createRepoCombiner } from '../../src/repo-combiner.js';

export default function App(options) {
  const { target } = options;

  // State management
  let repoUrl = 'https://github.com/yamadashy/repomix';
  let format = 'markdown';
  let authType = 'none';
  let githubToken = '';
  let githubUsername = '';
  let githubPassword = '';
  let result = null;
  let loading = false;
  let processing = false;
  let progressPercent = 0;
  let progressMessage = 'Processing repository...';
  let errorMsg = '';
  let copyButtonText = 'Copy';

  // Methods
  function resetUI() {
    errorMsg = '';
    processing = false;
    progressPercent = 0;
    progressMessage = 'Processing repository...';
    result = null;
    copyButtonText = 'Copy';
    render();
  }

  function updateProgress(status) {
    processing = true;
    progressMessage = status.message || 'Processing...';

    if (status.progress !== undefined) {
      progressPercent = status.progress * 100;
    }
    render();
  }

  async function processRepository() {
    if (!repoUrl || !repoUrl.includes('github.com')) {
      errorMsg = 'Please enter a valid GitHub repository URL';
      render();
      return;
    }

    resetUI();
    loading = true;
    render();

    try {
      const auth = {};

      if (authType === 'token') {
        if (!githubToken) {
          errorMsg = 'Please enter a GitHub token or select a different authentication method';
          loading = false;
          render();
          return;
        }
        auth.token = githubToken;
      } else if (authType === 'basic') {
        if (!githubUsername || !githubPassword) {
          errorMsg =
            'Please enter both username and password or select a different authentication method';
          loading = false;
          render();
          return;
        }
        auth.username = githubUsername;
        auth.password = githubPassword;
      }

      const repoCombiner = createRepoCombiner({
        format,
        auth,
        onProgress: updateProgress,
      });

      result = await repoCombiner.processRepo(repoUrl);
    } catch (error) {
      console.error('Error processing repository:', error);
      errorMsg = `Error processing repository: ${error.message}`;
    } finally {
      loading = false;
      processing = false;
      render();
    }
  }

  function copyOutput() {
    const textToCopy = result;
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        copyButtonText = 'Copied!';
        render();
        setTimeout(() => {
          copyButtonText = 'Copy';
          render();
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  }

  function downloadOutput() {
    const repoName = getRepoNameFromUrl(repoUrl);

    let content = result;
    let filename;
    let type;

    if (format === 'json') {
      content = JSON.stringify(result, null, 2);
      filename = `${repoName}.json`;
      type = 'application/json';
    } else if (format === 'markdown') {
      filename = `${repoName}.md`;
      type = 'text/markdown';
    } else {
      filename = `${repoName}.txt`;
      type = 'text/plain';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getRepoNameFromUrl(url) {
    try {
      const parts = url.split('/');
      return parts[parts.length - 1].replace('.git', '');
    } catch (error) {
      return 'repository';
    }
  }

  function getFormattedResult() {
    if (!result) return '';

    if (format === 'json') {
      return `<pre>${JSON.stringify(result, null, 2)}</pre>`;
    } else if (format === 'markdown' && window.marked) {
      return window.marked.parse(result);
    } else {
      return `<pre>${result}</pre>`;
    }
  }

  // Event handlers
  function handleAuthTypeChange(e) {
    authType = e.target.value;
    render();
  }

  function handleFormatChange(e) {
    format = e.target.value;
    render();
  }

  function handleRepoUrlChange(e) {
    repoUrl = e.target.value;
  }

  function handleGithubTokenChange(e) {
    githubToken = e.target.value;
  }

  function handleGithubUsernameChange(e) {
    githubUsername = e.target.value;
  }

  function handleGithubPasswordChange(e) {
    githubPassword = e.target.value;
  }

  // Render function
  function render() {
    target.innerHTML = `
      <header>
        <h1>Repo Combiner</h1>
        <p class="subtitle">Svelte 5 Implementation</p>
      </header>
      
      <div class="form-container">
        <div class="form-group">
          <label for="repoUrl">GitHub Repository URL:</label>
          <input type="text" id="repoUrl" value="${repoUrl}" placeholder="https://github.com/username/repository">
        </div>

        <div class="form-group">
          <label for="format">Output Format:</label>
          <select id="format">
            <option value="text" ${format === 'text' ? 'selected' : ''}>Text</option>
            <option value="markdown" ${format === 'markdown' ? 'selected' : ''}>Markdown</option>
            <option value="json" ${format === 'json' ? 'selected' : ''}>JSON</option>
          </select>
        </div>
        
        <div class="form-group">
          <details>
            <summary>Authentication (for private repositories)</summary>
            <div style="padding: 10px 0;">
              <div class="form-group">
                <label for="authType">Authentication Method:</label>
                <select id="authType">
                  <option value="none" ${authType === 'none' ? 'selected' : ''}>None (Public Repository)</option>
                  <option value="token" ${authType === 'token' ? 'selected' : ''}>Personal Access Token</option>
                  <option value="basic" ${authType === 'basic' ? 'selected' : ''}>Username & Password</option>
                </select>
              </div>
              
              <div id="tokenAuth" style="display: ${authType === 'token' ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="githubToken">GitHub Personal Access Token:</label>
                  <input type="password" id="githubToken" value="${githubToken}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
                </div>
              </div>
              
              <div id="basicAuth" style="display: ${authType === 'basic' ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="githubUsername">GitHub Username:</label>
                  <input type="text" id="githubUsername" value="${githubUsername}" placeholder="Your GitHub username">
                </div>
                <div class="form-group">
                  <label for="githubPassword">GitHub Password:</label>
                  <input type="password" id="githubPassword" value="${githubPassword}" placeholder="Your GitHub password">
                </div>
              </div>
            </div>
          </details>
        </div>

        <div class="form-group">
          <button id="processButton">Process Repository</button>
        </div>

        <div class="progress" style="display: ${processing ? 'block' : 'none'}">
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
          </div>
          <div class="status">${progressMessage}</div>
        </div>
        
        <div class="error" style="display: ${errorMsg ? 'block' : 'none'}">${errorMsg}</div>
      </div>
      
      <div class="loading" style="display: ${loading ? 'block' : 'none'}">
        <div class="spinner"></div>
        <div>Processing repository...</div>
      </div>

      <div class="output-container" style="display: ${result ? 'block' : 'none'}">
        <div class="output-header">
          <h2>Repository Content</h2>
          <div class="output-actions">
            <button id="copyButton">${copyButtonText}</button>
            <button id="downloadButton">Download</button>
          </div>
        </div>
        <div id="output">${getFormattedResult()}</div>
      </div>
    `;

    // Add event listeners after DOM update
    document.getElementById('repoUrl').addEventListener('input', handleRepoUrlChange);
    document.getElementById('format').addEventListener('change', handleFormatChange);
    document.getElementById('authType').addEventListener('change', handleAuthTypeChange);
    document.getElementById('processButton').addEventListener('click', processRepository);

    if (document.getElementById('githubToken')) {
      document.getElementById('githubToken').addEventListener('input', handleGithubTokenChange);
    }

    if (document.getElementById('githubUsername')) {
      document
        .getElementById('githubUsername')
        .addEventListener('input', handleGithubUsernameChange);
    }

    if (document.getElementById('githubPassword')) {
      document
        .getElementById('githubPassword')
        .addEventListener('input', handleGithubPasswordChange);
    }

    if (document.getElementById('copyButton')) {
      document.getElementById('copyButton').addEventListener('click', copyOutput);
    }

    if (document.getElementById('downloadButton')) {
      document.getElementById('downloadButton').addEventListener('click', downloadOutput);
    }
  }

  // Initial render
  render();

  // Return instance
  return {
    render,
    destroy() {
      // Clean up if needed
    },
  };
}
