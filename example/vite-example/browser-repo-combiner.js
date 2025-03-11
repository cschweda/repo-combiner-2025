/**
 * Browser-specific implementation of repo-combiner
 * This module creates a version that works in the browser by using fetch for GitHub API calls
 */

// Default configuration
const DEFAULT_CONFIG = {
  format: 'text',
  skipDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.github', '.vscode'],
  skipFiles: [
    '.DS_Store',
    '.gitignore',
    'package-lock.json',
    'yarn.lock',
    '.eslintrc',
    '.prettierrc',
    'Thumbs.db',
  ],
  skipExtensions: [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.ico',
    '.svg',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.pdf',
    '.mp3',
    '.mp4',
    '.zip',
    '.gz',
    '.exe',
    '.dll',
  ],
  maxFileSizeMB: 10,
  concurrency: 5,
  timeout: 300000,
  auth: {
    token: '',
    username: '',
    password: '',
  },
  onProgress: null,
};

/**
 * Main class for repository conversion in browser
 */
class BrowserRepoCombiner {
  /**
   * Create a new BrowserRepoCombiner instance
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.files = [];
    
    // Initialize stats with explicit numeric type for token counters
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      totalTokens: 0,
      skippedFiles: 0,
      skippedSize: 0,
      startTime: null,
      endTime: null,
      elapsedTime: 0,
    };
    
    this.aborted = false;
    this.activePromises = new Set();
    this.cacheMap = new Map();
  }

  /**
   * Report progress to the onProgress callback
   * @param {string} message Progress message
   * @param {number} progress Progress value (0-1)
   * @param {string} phase Current processing phase
   * @private
   */
  _reportProgress(message, progress = undefined, phase = 'processing') {
    if (typeof this.config.onProgress === 'function') {
      this.config.onProgress({
        message,
        progress,
        phase,
        stats: { ...this.stats },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Format token count safely to avoid NaN
   * @param {number} count - The token count to format
   * @returns {string} Formatted token count
   * @private
   */
  _formatTokenCount(count) {
    // Ensure we have a valid number
    const validCount = isNaN(count) ? 0 : Number(count || 0);
    // Format with thousands separators
    return validCount.toLocaleString();
  }

  /**
   * Estimate token count for a text string
   * This is a rough approximation similar to how LLMs tokenize text
   * @param {string} text - The text to analyze
   * @returns {number} Estimated token count
   * @private
   */
  _estimateTokenCount(text) {
    if (!text || typeof text !== 'string') return 0;

    // Simple tokenization approach based on whitespace and common punctuation
    // This is an approximation; actual LLM tokenizers are more sophisticated
    const cleanText = text
      .replace(/[.,/#!$%^&*;:{}=\-_`~()[\]<>]/g, ' $& ') // Add spaces around punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Split on whitespace for a rough token count
    const tokens = cleanText.split(/\s+/);

    // For better accuracy - account for the encoding efficiency
    // Most LLM tokenizers use about 4 characters per token on average for English text
    const approximateCharactersPerToken = 4;
    const charCount = text.length;

    // Estimate based on raw tokens and character count
    let rawTokenCount = tokens.length;
    let charBasedCount = Math.ceil(charCount / approximateCharactersPerToken);

    // Use the average of both approaches, but ensure we have at least 1 token for non-empty text
    const result = Math.max(1, Math.round((rawTokenCount + charBasedCount) / 2));
    return isNaN(result) ? 0 : result;
  }

  /**
   * Get formatted datetime string for filenames
   * @returns {string} Formatted datetime (YYYY-MM-DD_HH-MM-SS)
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
   * Get file extension
   * @param {string} filePath - File path
   * @returns {string} File extension (with dot)
   * @private 
   */
  _getFileExtension(filePath) {
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) return '';
    return filePath.slice(lastDotIndex).toLowerCase();
  }

  /**
   * Check if a file should be skipped based on configuration
   * @param {string} filePath - File path
   * @returns {boolean} True if file should be skipped, false otherwise
   * @private
   */
  _shouldSkipFile(filePath) {
    // Skip files by extension
    const extension = this._getFileExtension(filePath);
    if (extension && this.config.skipExtensions.includes(extension)) {
      return true;
    }

    // Skip specific files
    const fileName = filePath.split('/').pop();
    if (this.config.skipFiles.includes(fileName)) {
      return true;
    }

    // Skip files in specific directories
    for (const dir of this.config.skipDirs) {
      if (filePath.includes(`/${dir}/`) || filePath === dir || filePath.startsWith(`${dir}/`)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract owner and repo from GitHub URL
   * @param {string} repoUrl - GitHub repository URL
   * @returns {object} Object with owner and repo properties
   * @private
   */
  _parseGitHubUrl(repoUrl) {
    let url = repoUrl;
    
    // Handle SSH format
    if (url.startsWith('git@github.com:')) {
      url = url.replace('git@github.com:', 'https://github.com/');
    }
    
    // Remove trailing .git if present
    if (url.endsWith('.git')) {
      url = url.slice(0, -4);
    }
    
    // Parse URL to extract owner and repo
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      
      if (pathParts.length < 2) {
        throw new Error('Invalid GitHub repository URL format');
      }
      
      return {
        owner: pathParts[0],
        repo: pathParts[1],
      };
    } catch (error) {
      throw new Error('Invalid GitHub repository URL format');
    }
  }

  /**
   * Create GitHub API request headers including authentication
   * @returns {Object} Headers for GitHub API requests
   * @private
   */
  _getGitHubHeaders() {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
    };
    
    if (this.config.auth.token) {
      headers['Authorization'] = `token ${this.config.auth.token}`;
    } else if (this.config.auth.username && this.config.auth.password) {
      const authString = `${this.config.auth.username}:${this.config.auth.password}`;
      const encodedAuth = btoa(authString);
      headers['Authorization'] = `Basic ${encodedAuth}`;
    }
    
    return headers;
  }

  /**
   * Fetch repository contents from GitHub API via proxy
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} path - File path within the repository
   * @returns {Promise<Array>} Repository contents
   * @private
   */
  async _fetchRepoContents(owner, repo, path = '', branch = 'main') {
    const apiUrl = `${this.proxyUrl}/contents/${owner}/${repo}/${branch}/${path}`;
    
    try {
      const response = await fetch(apiUrl, {
        headers: this._getGitHubHeaders(),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = `Failed to fetch ${path || 'repository root'}: ${response.status} ${response.statusText}`;
        
        if (errorData.error && errorData.message) {
          errorMessage = errorData.message;
        }
        
        if (response.status === 403 && errorMessage.includes('rate limit')) {
          errorMessage = 'API rate limit exceeded for your IP. Please use authentication or try again later.';
        } else if (response.status === 404) {
          errorMessage = `Path not found: ${path}. Check that the path exists in the repository.`;
        } else if (response.status === 401) {
          errorMessage = 'Authentication failed. Please check your credentials.';
        } else if (response.status === 500) {
          errorMessage = `Proxy server error. Is the proxy server running at ${this.proxyUrl}?`;
        }
        
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      // Handle connection errors
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError') || 
          error.message.includes('ECONNREFUSED')) {
        throw new Error(`Could not connect to proxy server at ${this.proxyUrl}. Is the proxy server running?`);
      }
      
      // Pass through common error messages
      if (!error.message.includes('API rate limit') && 
          !error.message.includes('Authentication failed') &&
          !error.message.includes('Path not found') &&
          !error.message.includes('Proxy server')) {
        error.message = `Failed to process repository: ${error.message}`;
      }
      throw error;
    }
  }

  /**
   * Fetch file content from GitHub API via proxy
   * @param {string} url - GitHub API URL for the file
   * @returns {Promise<string>} File content
   * @private
   */
  async _fetchFileContent(url) {
    try {
      // Parse URL to extract owner, repo, branch, and path
      // Format we're expecting: https://raw.githubusercontent.com/OWNER/REPO/BRANCH/PATH
      const match = url.match(/https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/);
      
      if (!match) {
        throw new Error(`Invalid file URL format: ${url}`);
      }
      
      const [, owner, repo, branch, path] = match;
      
      // Use proxy URL
      const proxyUrl = `${this.proxyUrl}/raw/${owner}/${repo}/${branch}/${path}`;
      
      const response = await fetch(proxyUrl, {
        headers: this._getGitHubHeaders(),
      });
      
      if (!response.ok) {
        // Try to parse error if it's JSON
        try {
          const errorData = await response.json();
          if (errorData.error && errorData.message) {
            throw new Error(errorData.message);
          }
        } catch {
          // If it's not JSON, just use the status
          throw new Error(`Failed to fetch file content: ${response.status} ${response.statusText}`);
        }
      }
      
      // Get the file content as text
      return await response.text();
    } catch (error) {
      // Handle connection errors
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError') || 
          error.message.includes('ECONNREFUSED')) {
        throw new Error(`Could not connect to proxy server at ${this.proxyUrl}. Is the proxy server running?`);
      }
      
      throw new Error(`Failed to fetch file content: ${error.message}`);
    }
  }

  /**
   * Count lines in a string
   * @param {string} content - File content
   * @returns {number} Line count
   * @private
   */
  _countLines(content) {
    if (!content) return 0;
    return content.split('\n').length;
  }

  /**
   * Process a single file
   * @param {Object} fileInfo - File information from GitHub API
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} branch - Repository branch
   * @returns {Promise<Object>} Processed file
   * @private
   */
  async _processFile(fileInfo, owner, repo, branch) {
    // Skip files based on configuration
    if (this._shouldSkipFile(fileInfo.path)) {
      this.stats.skippedFiles++;
      this.stats.skippedSize += fileInfo.size || 0;
      this._reportProgress(`Skipping file: ${fileInfo.path} (excluded by configuration)`);
      return null;
    }
    
    // Skip files that exceed max size
    const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024);
    if (this.config.maxFileSizeMB > 0 && fileSizeMB > this.config.maxFileSizeMB) {
      this._reportProgress(`Skipping large file: ${fileInfo.path} (${fileSizeMB.toFixed(2)}MB)`);
      this.stats.skippedFiles++;
      this.stats.skippedSize += fileInfo.size || 0;
      return null;
    }
    
    try {
      // Fetch file content
      this._reportProgress(`Loading file: ${fileInfo.path}`);
      
      // Determine file type for logging
      const extension = this._getFileExtension(fileInfo.path);
      const fileType = extension ? extension.slice(1).toUpperCase() : 'text';
      
      const content = await this._fetchFileContent(fileInfo.download_url);
      this._reportProgress(`Downloaded ${fileType} file: ${fileInfo.path} (${this._formatFileSize(fileInfo.size || 0)})`);
      
      // Count lines
      const lines = this._countLines(content);
      
      // Calculate token count
      const tokens = this._estimateTokenCount(content);
      this.stats.totalTokens += tokens;
      
      // Update stats
      this.stats.totalFiles++;
      this.stats.totalSize += fileInfo.size || 0;
      
      this._reportProgress(
        `Processed: ${fileInfo.path} - ${lines} lines, ${tokens} tokens`, 
        undefined, 
        'processing'
      );
      
      // Return processed file
      return {
        path: fileInfo.path,
        githubUrl: `https://github.com/${owner}/${repo}/blob/${branch}/${fileInfo.path}`,
        content,
        lines,
        tokens,
        stats: {
          size: fileInfo.size,
          sizeFormatted: this._formatFileSize(fileInfo.size),
          lines,
          tokens,
        }
      };
    } catch (error) {
      this._reportProgress(`Error processing file ${fileInfo.path}: ${error.message}`, undefined, 'error');
      return null;
    }
  }

  /**
   * Format file size
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   * @private
   */
  _formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Process a directory and its contents recursively
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} path - Directory path
   * @param {string} branch - Repository branch
   * @returns {Promise<Array>} Processed files
   * @private
   */
  async _processDirectory(owner, repo, path, branch) {
    try {
      const contents = await this._fetchRepoContents(owner, repo, path);
      const processedFiles = [];
      let totalItems = contents.length;
      let processedCount = 0;
      
      // Process files and directories
      for (const item of contents) {
        if (this.aborted) break;
        
        processedCount++;
        const progress = processedCount / totalItems;
        this._reportProgress(
          `Processing ${processedCount} of ${totalItems}: ${item.path}`, 
          progress, 
          'processing'
        );
        
        if (item.type === 'file') {
          const processedFile = await this._processFile(item, owner, repo, branch);
          if (processedFile) {
            processedFiles.push(processedFile);
          }
        } else if (item.type === 'dir' && !this._shouldSkipFile(item.path)) {
          // Recursively process subdirectories
          this._reportProgress(`Exploring directory: ${item.path}`, progress, 'processing');
          const subDirFiles = await this._processDirectory(owner, repo, item.path, branch);
          processedFiles.push(...subDirFiles);
        }
      }
      
      return processedFiles;
    } catch (error) {
      this._reportProgress(`Error processing directory ${path}: ${error.message}`);
      return [];
    }
  }

  // Proxy server base URL (configurable)
  get proxyUrl() {
    return this.config.proxyUrl || 'http://localhost:3010';
  }
  
  /**
   * Get default branch for a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<string>} Default branch name
   * @private
   */
  async _getDefaultBranch(owner, repo) {
    try {
      const apiUrl = `${this.proxyUrl}/repo/${owner}/${repo}`;
      this._reportProgress('Requesting repository data via proxy...', undefined, 'initializing');
      
      const response = await fetch(apiUrl, {
        headers: this._getGitHubHeaders(),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = `Failed to fetch repository info: ${response.status}`;
        
        // Handle error responses from the proxy
        if (errorData.error && errorData.message) {
          errorMessage = errorData.message;
          
          // Additional context for common errors
          if (errorData.status === 403 && errorMessage.includes('rate limit')) {
            errorMessage += ' To avoid rate limiting, please add a GitHub token using the authentication options.';
          } else if (errorData.status === 404) {
            errorMessage = `Repository not found: ${owner}/${repo}. Please check that the URL is correct and the repository exists.`;
          } else if (errorData.status === 401) {
            errorMessage = 'Authentication failed. Please check your GitHub token or credentials.';
          }
        } else if (response.status === 500) {
          errorMessage = `Proxy server error. Is the proxy server running at ${this.proxyUrl}?`;
        }
        
        throw new Error(errorMessage);
      }
      
      const repoInfo = await response.json();
      return repoInfo.default_branch || 'main';
    } catch (error) {
      // If the error is a connection error, it might be a proxy issue
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError') || 
          error.message.includes('ECONNREFUSED')) {
        throw new Error(`Could not connect to proxy server at ${this.proxyUrl}. Is the proxy server running?`);
      }
      
      // If already a detailed error message, pass it through
      if (error.message.includes('API rate limit') || 
          error.message.includes('Repository not found') ||
          error.message.includes('Authentication failed') ||
          error.message.includes('Access denied') ||
          error.message.includes('Proxy server')) {
        throw error;
      }
      
      // Otherwise wrap with context
      throw new Error(`Failed to get default branch: ${error.message}`);
    }
  }

  /**
   * Generate output in the specified format
   * @param {string} format - Output format (text, json, markdown)
   * @returns {string|Object} Formatted output
   * @private
   */
  _generateOutput(format) {
    if (format === 'json') {
      return {
        files: this.files,
        stats: this.stats,
        repository: this.repositoryUrl,
        generatedAt: new Date().toISOString(),
      };
    } else if (format === 'markdown') {
      let output = `# Repository: ${this.repositoryUrl}\n\n`;
      output += `Generated at: ${new Date().toISOString()}\n\n`;
      output += '## Stats\n\n';
      output += `- Total files: ${this.stats.totalFiles}\n`;
      output += `- Total size: ${this._formatFileSize(this.stats.totalSize)}\n`;
      output += `- Total lines: ${this.files.reduce((sum, file) => sum + file.lines, 0)}\n`;
      output += `- Total tokens: ${this._formatTokenCount(this.stats.totalTokens)}\n\n`;
      
      // Add token assessment
      output += '## Token Assessment\n\n';
      output += `${this._getTokenAssessment(this.stats.totalTokens)}\n\n`;
      
      // Add files
      for (const file of this.files) {
        output += `## File: ${file.path}\n\n`;
        output += `- Lines: ${file.lines}\n`;
        output += `- Size: ${file.stats.sizeFormatted}\n`;
        output += `- [View on GitHub](${file.githubUrl})\n\n`;
        
        // Determine language for code block based on file extension
        const extension = this._getFileExtension(file.path).slice(1); // Remove the dot
        const language = extension || '';
        
        output += `\`\`\`${language}\n${file.content}\n\`\`\`\n\n`;
      }
      
      return output;
    } else {
      // Default to text format
      let output = `Repository: ${this.repositoryUrl}\n\n`;
      output += `Generated at: ${new Date().toISOString()}\n\n`;
      output += 'Stats:\n';
      output += `- Total files: ${this.stats.totalFiles}\n`;
      output += `- Total size: ${this._formatFileSize(this.stats.totalSize)}\n`;
      output += `- Total lines: ${this.files.reduce((sum, file) => sum + file.lines, 0)}\n`;
      output += `- Total tokens: ${this._formatTokenCount(this.stats.totalTokens)}\n\n`;
      
      // Add token assessment
      output += 'Token Assessment:\n';
      output += `${this._getTokenAssessment(this.stats.totalTokens)}\n\n`;
      
      // Add files
      for (const file of this.files) {
        output += `--- ${file.path} ---\n`;
        output += `Lines: ${file.lines} | Size: ${file.stats.sizeFormatted} | GitHub: ${file.githubUrl}\n\n`;
        output += `${file.content}\n\n`;
      }
      
      return output;
    }
  }

  /**
   * Get token assessment based on token count
   * @param {number} tokenCount - Number of tokens
   * @returns {string} Assessment message
   * @private
   */
  _getTokenAssessment(tokenCount) {
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

  /**
   * Main method to process a repository
   * @param {string} repoUrl GitHub repository URL
   * @param {Object} options Processing options
   * @returns {Promise<string|Object>} Combined repository content
   * @throws {Error} If the repository URL is invalid or processing fails
   */
  async processRepo(repoUrl, options = {}) {
    // Validate repository URL
    if (!repoUrl || typeof repoUrl !== 'string') {
      throw new Error('Repository URL is required and must be a string');
    }

    if (
      !repoUrl.match(/^(https?:\/\/|git@)([a-zA-Z0-9-]+\.)+[a-zA-Z0-9]{2,}(\/|:)[^\s]+\/[^\s]+$/)
    ) {
      throw new Error(
        'Invalid repository URL format. Expected: https://github.com/username/repository or git@github.com:username/repository'
      );
    }

    // Merge options with existing config
    const config = { ...this.config, ...options };
    this.config = config;
    this.repositoryUrl = repoUrl;

    // Reset state for new processing
    this.files = [];
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      totalTokens: 0,
      skippedFiles: 0,
      skippedSize: 0,
      startTime: Date.now(),
      endTime: null,
      elapsedTime: 0,
    };
    this.aborted = false;

    try {
      this._reportProgress(`Initializing repository processing: ${repoUrl}`, 0, 'initializing');

      // Parse GitHub URL
      const { owner, repo } = this._parseGitHubUrl(repoUrl);
      this._reportProgress(`Repository identified: ${owner}/${repo}`, 0.1, 'initializing');

      // Get default branch
      this._reportProgress('Fetching repository information...', 0.15, 'initializing');
      const branch = await this._getDefaultBranch(owner, repo);
      this._reportProgress(`Using branch: ${branch}`, 0.2, 'initializing');

      // Process the repository
      this._reportProgress(`Starting file processing using branch: ${branch}`, 0.2, 'processing');
      this.files = await this._processDirectory(owner, repo, '', branch);
      this._reportProgress(`Completed file processing. Found ${this.files.length} relevant files.`, 0.8, 'processing');

      // Sort files by path for consistent output
      this.files.sort((a, b) => a.path.localeCompare(b.path));
      this._reportProgress('Files organized and sorted.', 0.85, 'processing');

      // Generate output in the requested format
      this._reportProgress(`Generating ${config.format} output...`, 0.9, 'generating');
      const output = this._generateOutput(config.format);

      // Update final stats
      this.stats.endTime = Date.now();
      this.stats.elapsedTime = this.stats.endTime - this.stats.startTime;
      const totalLines = this.files.reduce((sum, file) => sum + (file.lines || 0), 0);
      const processingTimeInSeconds = (this.stats.elapsedTime / 1000).toFixed(2);

      // Calculate total tokens from files (more accurate than running total)
      this.stats.totalTokens = this.files.reduce((sum, file) => sum + (file.tokens || 0), 0);

      // Prepare a summary with all stats
      const summary = `
Repository processing completed:
- Repository: ${repoUrl}
- Output format: ${config.format}
- Total files processed: ${this.stats.totalFiles}
- Total size: ${this._formatFileSize(this.stats.totalSize)}
- Total lines: ${totalLines.toLocaleString()}
- Total tokens: ${this._formatTokenCount(this.stats.totalTokens)}
- Token assessment: ${this._getTokenAssessment(this.stats.totalTokens)}
- Skipped files: ${this.stats.skippedFiles}
- Processing time: ${processingTimeInSeconds} seconds

NOTE: When running in a browser without a proxy server, file contents cannot be fetched due to CORS restrictions.
For full functionality, use the Node.js CLI version or implement a server-side proxy.
      `;

      // Report completion with full stats
      this._reportProgress(summary, 1, 'complete');

      return output;
    } catch (error) {
      this._reportProgress(`Error processing repository: ${error.message}`, undefined, 'error');
      throw error;
    }
  }
}

/**
 * Create a new RepoCombiner instance
 * @param {Object} config Configuration options
 * @returns {Object} RepoCombiner instance
 */
export function createRepoCombiner(config = {}) {
  return new BrowserRepoCombiner(config);
}