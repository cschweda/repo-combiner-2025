import { createRepoCombiner } from '../../src/repo-combiner.js';

export const App = {
  template: `
    <header>
      <h1>Repo Combiner</h1>
      <p class="subtitle">Vue 3 Implementation</p>
    </header>
    
    <div class="form-container">
      <div class="form-group">
        <label for="repoUrl">GitHub Repository URL:</label>
        <input type="text" id="repoUrl" v-model="repoUrl" placeholder="https://github.com/username/repository">
      </div>

      <div class="form-group">
        <label for="format">Output Format:</label>
        <select id="format" v-model="format">
          <option value="text">Text</option>
          <option value="markdown" selected>Markdown</option>
          <option value="json">JSON</option>
        </select>
      </div>
      
      <div class="form-group">
        <details>
          <summary>Authentication (for private repositories)</summary>
          <div style="padding: 10px 0;">
            <div class="form-group">
              <label for="authType">Authentication Method:</label>
              <select id="authType" v-model="authType">
                <option value="none">None (Public Repository)</option>
                <option value="token">Personal Access Token</option>
                <option value="basic">Username & Password</option>
              </select>
            </div>
            
            <div v-if="authType === 'token'" id="tokenAuth">
              <div class="form-group">
                <label for="githubToken">GitHub Personal Access Token:</label>
                <input type="password" id="githubToken" v-model="githubToken" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
              </div>
            </div>
            
            <div v-if="authType === 'basic'" id="basicAuth">
              <div class="form-group">
                <label for="githubUsername">GitHub Username:</label>
                <input type="text" id="githubUsername" v-model="githubUsername" placeholder="Your GitHub username">
              </div>
              <div class="form-group">
                <label for="githubPassword">GitHub Password:</label>
                <input type="password" id="githubPassword" v-model="githubPassword" placeholder="Your GitHub password">
              </div>
            </div>
          </div>
        </details>
      </div>

      <div class="form-group">
        <button id="processButton" @click="processRepository">Process Repository</button>
      </div>

      <div class="progress" v-if="processing">
        <div class="progress-bar">
          <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="status">{{ progressMessage }}</div>
      </div>
      
      <div class="error" v-if="errorMsg">{{ errorMsg }}</div>
    </div>
    
    <div class="loading" v-if="loading">
      <div class="spinner"></div>
      <div>Processing repository...</div>
    </div>

    <div class="output-container" v-if="result">
      <div class="output-header">
        <h2>Repository Content</h2>
        <div class="output-actions">
          <button @click="copyOutput">{{ copyButtonText }}</button>
          <button @click="downloadOutput">Download</button>
        </div>
      </div>
      <div id="output" v-html="formattedResult"></div>
    </div>
  `,
  data() {
    return {
      repoUrl: 'https://github.com/yamadashy/repomix',
      format: 'markdown',
      authType: 'none',
      githubToken: '',
      githubUsername: '',
      githubPassword: '',
      result: null,
      loading: false,
      processing: false,
      progressPercent: 0,
      progressMessage: 'Processing repository...',
      errorMsg: '',
      copyButtonText: 'Copy',
    };
  },
  computed: {
    formattedResult() {
      if (!this.result) return '';
      
      // Get token assessment if we have it
      let tokenInfo = '';
      if (this.format === 'json' && typeof this.result === 'object' && this.result.stats && this.result.stats.totalTokens) {
        const tokenCount = this.result.stats.totalTokens;
        const assessment = this.getTokenAssessment(tokenCount);
        tokenInfo = `
          <div class="token-assessment">
            <h3>Token Assessment</h3>
            <p><strong>Total Tokens:</strong> ${tokenCount.toLocaleString()}</p>
            <p><strong>Assessment:</strong> ${assessment}</p>
          </div>
        `;
      }

      if (this.format === 'json') {
        return tokenInfo + `<pre>${JSON.stringify(this.result, null, 2)}</pre>`;
      } else if (this.format === 'markdown' && window.marked) {
        return tokenInfo + window.marked.parse(this.result);
      } else {
        return tokenInfo + `<pre>${this.result}</pre>`;
      }
    },
  },
  methods: {
    getTokenAssessment(tokenCount) {
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
    },
    
    async processRepository() {
      if (!this.repoUrl || !this.repoUrl.includes('github.com')) {
        this.errorMsg = 'Please enter a valid GitHub repository URL';
        return;
      }

      this.resetUI();
      this.loading = true;

      try {
        const auth = {};

        if (this.authType === 'token') {
          if (!this.githubToken) {
            this.errorMsg =
              'Please enter a GitHub token or select a different authentication method';
            this.loading = false;
            return;
          }
          auth.token = this.githubToken;
        } else if (this.authType === 'basic') {
          if (!this.githubUsername || !this.githubPassword) {
            this.errorMsg =
              'Please enter both username and password or select a different authentication method';
            this.loading = false;
            return;
          }
          auth.username = this.githubUsername;
          auth.password = this.githubPassword;
        }

        const repoCombiner = createRepoCombiner({
          format: this.format,
          auth,
          onProgress: this.updateProgress,
        });

        this.result = await repoCombiner.processRepo(this.repoUrl);
      } catch (error) {
        console.error('Error processing repository:', error);
        this.errorMsg = `Error processing repository: ${error.message}`;
      } finally {
        this.loading = false;
        this.processing = false;
      }
    },
    updateProgress(status) {
      this.processing = true;
      this.progressMessage = status.message || 'Processing...';

      if (status.progress !== undefined) {
        this.progressPercent = status.progress * 100;
      }
    },
    resetUI() {
      this.errorMsg = '';
      this.processing = false;
      this.progressPercent = 0;
      this.progressMessage = 'Processing repository...';
      this.result = null;
      this.copyButtonText = 'Copy';
    },
    copyOutput() {
      const textToCopy = this.result;
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          this.copyButtonText = 'Copied!';
          setTimeout(() => {
            this.copyButtonText = 'Copy';
          }, 2000);
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
        });
    },
    getFormattedDateTime() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    },
    downloadOutput() {
      const repoName = this.getRepoNameFromUrl(this.repoUrl);
      const dateTime = this.getFormattedDateTime();

      let content = this.result;
      let filename;
      let type;

      if (this.format === 'json') {
        content = JSON.stringify(this.result, null, 2);
        filename = `${repoName}_${dateTime}.json`;
        type = 'application/json';
      } else if (this.format === 'markdown') {
        filename = `${repoName}_${dateTime}.md`;
        type = 'text/markdown';
      } else {
        filename = `${repoName}_${dateTime}.txt`;
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
    },
    getRepoNameFromUrl(url) {
      try {
        const parts = url.split('/');
        return parts[parts.length - 1].replace('.git', '');
      } catch (error) {
        return 'repository';
      }
    },
  },
};
