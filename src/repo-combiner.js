// repo-combiner.js
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// This module is ESM-only

/**
 * Binary file signatures (magic numbers) to detect binary files
 * This helps to properly handle binary files without trying to read them as text
 */
const BINARY_FILE_SIGNATURES = [
  // Images
  { signature: Buffer.from([0xff, 0xd8, 0xff]), extension: '.jpg' }, // JPEG
  { signature: Buffer.from([0x89, 0x50, 0x4e, 0x47]), extension: '.png' }, // PNG
  { signature: Buffer.from([0x47, 0x49, 0x46]), extension: '.gif' }, // GIF
  // Archives
  { signature: Buffer.from([0x50, 0x4b, 0x03, 0x04]), extension: '.zip' }, // ZIP
  { signature: Buffer.from([0x1f, 0x8b]), extension: '.gz' }, // GZIP
  // PDFs
  { signature: Buffer.from([0x25, 0x50, 0x44, 0x46]), extension: '.pdf' }, // PDF
  // Audio/Video
  { signature: Buffer.from([0x49, 0x44, 0x33]), extension: '.mp3' }, // MP3
  { signature: Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]), extension: '.mp4' }, // MP4
];

// Configuration defaults
const DEFAULT_CONFIG = {
  format: 'text', // Output format: text, json, or markdown
  skipDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.github', '.vscode'],
  skipFiles: [
    '.DS_Store',
    '.gitignore',
    'package-lock.json',
    'yarn.lock',
    '.eslintrc',
    '.prettierrc',
    'Thumbs.db', // Windows thumbnail cache file
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
  // Use path.join and path.normalize for cross-platform path compatibility
  tempDir: path.normalize(path.join(os.tmpdir(), 'repo-combiner')),
  preserveStructure: true,
  maxFileSizeMB: 10,
  concurrency: 5, // Number of concurrent file operations
  timeout: 300000, // Timeout for operations in milliseconds (5 minutes)
  auth: {
    token: process.env.GITHUB_TOKEN || '',
    username: process.env.GITHUB_USERNAME || '',
    password: process.env.GITHUB_PASSWORD || '',
  },
  onProgress: null, // Progress callback function
};

/**
 * Main class for repository conversion
 */
class RepoCombiner {
  /**
   * Create a new RepoCombiner instance
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.files = [];

    // Initialize stats with explicit numeric type for token counters
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      totalTokens: 0, // Initialize explicitly to zero
      skippedFiles: 0,
      skippedSize: 0,
      startTime: null,
      endTime: null,
      elapsedTime: 0,
    };

    // Validate stats object
    if (typeof this.stats.totalTokens !== 'number') {
      this.stats.totalTokens = 0;
    }

    this.aborted = false;
    this.activePromises = new Set();
    this.cacheMap = new Map(); // Cache for expensive operations
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
   * Add datetime to a filename
   * @param {string} filename - Base filename
   * @returns {string} Filename with datetime
   * @private
   */
  _addDateTimeToFilename(filename) {
    const dateTime = this._getFormattedDateTime();
    // Normalize the path for cross-platform compatibility
    const normalizedPath = path.normalize(filename);
    const ext = path.extname(normalizedPath);
    const base = path.basename(normalizedPath, ext);
    const dir = path.dirname(normalizedPath);
    // Join with platform-specific separator
    return path.join(dir, `${base}_${dateTime}${ext}`);
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

    // Reset state for new processing
    this.files = [];
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      skippedFiles: 0,
      skippedSize: 0,
      startTime: Date.now(),
      endTime: null,
      elapsedTime: 0,
    };
    this.aborted = false;

    try {
      this._reportProgress(`Processing repository: ${repoUrl}`, 0, 'initializing');

      // Create temporary directory if it doesn't exist
      try {
        await fs.mkdir(config.tempDir, { recursive: true });
      } catch (err) {
        // Handle the case where directory already exists or other errors
        if (err.code !== 'EEXIST') throw err;
      }

      // Clone/fetch the repository
      this._reportProgress('Cloning repository...', 0.1, 'cloning');
      const repoDir = await this.cloneRepository(repoUrl, config.tempDir);

      // Process all files with concurrency control
      this._reportProgress('Processing files...', 0.2, 'processing');
      await this.processDirectory(repoDir, config);

      // Generate output in the requested format
      this._reportProgress('Generating output...', 0.9, 'generating');
      const output = this.generateOutput(config.format);

      // Clean up temporary files
      if (!config.keepTemp) {
        this._reportProgress('Cleaning up temporary files...', 0.95, 'cleaning');
        await fs.rm(repoDir, { recursive: true, force: true }).catch(err => {
          console.warn(`Warning: Failed to clean up temporary files: ${err.message}`);
        });
      }

      // Update final stats
      this.stats.endTime = Date.now();
      this.stats.elapsedTime = this.stats.endTime - this.stats.startTime;

      // Ensure token count is properly formatted
      this.stats.totalTokens =
        typeof this.stats.totalTokens === 'number' && !isNaN(this.stats.totalTokens)
          ? this.stats.totalTokens
          : 0;

      const summaryMessage = `
Repository processing completed:
- Total files processed: ${this.stats.totalFiles}
- Total size: ${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB
- Total tokens: ${this._formatTokenCount(this.stats.totalTokens)}
- Skipped files: ${this.stats.skippedFiles}
- Skipped size: ${(this.stats.skippedSize / 1024 / 1024).toFixed(2)} MB
- Processing time: ${(this.stats.elapsedTime / 1000).toFixed(2)} seconds
      `;

      this._reportProgress('Processing complete', 1, 'complete');
      console.log(summaryMessage);

      return output;
    } catch (error) {
      this.stats.endTime = Date.now();
      this.stats.elapsedTime = this.stats.endTime - this.stats.startTime;

      this._reportProgress(`Error: ${error.message}`, undefined, 'error');

      console.error('Error processing repository:', error.message);

      // Enhanced error with repository URL
      const enhancedError = new Error(`Failed to process repository ${repoUrl}: ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.stats = { ...this.stats };

      throw enhancedError;
    }
  }

  /**
   * Cancel processing
   */
  abort() {
    this.aborted = true;
    // Cancel all active promises if possible
    for (const promise of this.activePromises) {
      if (promise.cancel && typeof promise.cancel === 'function') {
        promise.cancel();
      }
    }
    this._reportProgress('Processing aborted', undefined, 'aborted');
  }

  /**
   * Clone the GitHub repository to a local directory
   * @param {string} repoUrl GitHub repository URL
   * @param {string} targetDir Directory to clone to
   * @returns {Promise<string>} Path to the cloned repository
   * @throws {Error} If cloning fails
   */
  async cloneRepository(repoUrl, targetDir) {
    // Extract repo name from URL
    const repoName = this.getRepoNameFromUrl(repoUrl);
    if (!repoName) {
      throw new Error('Could not extract repository name from URL');
    }

    const repoPath = path.join(targetDir, repoName);

    // Prepare authentication for private repositories
    const authUrl = this.prepareAuthenticatedUrl(repoUrl);

    try {
      // Check if repo directory already exists
      if (existsSync(repoPath)) {
        this._reportProgress(`Repository exists at ${repoPath}, pulling latest changes...`);
        try {
          // Use cross-platform git commands with proper quoting
          const gitArgs = ['-C', repoPath, 'pull'];

          // Timeout to prevent hanging forever
          execSync(`git ${gitArgs.map(arg => JSON.stringify(arg)).join(' ')}`, {
            stdio: 'pipe',
            timeout: this.config.timeout,
          });
          this._reportProgress('Repository updated successfully');
        } catch (pullError) {
          // If pull fails, try removing and recloning
          this._reportProgress('Error pulling repository, trying to reclone...');
          try {
            await fs.rm(repoPath, { recursive: true, force: true });
          } catch (err) {
            // Ignore errors during cleanup
          }

          const cloneArgs = ['clone', '--depth=1', authUrl, repoPath];
          execSync(`git ${cloneArgs.map(arg => JSON.stringify(arg)).join(' ')}`, {
            stdio: 'pipe',
            timeout: this.config.timeout,
          });
        }
      } else {
        // Clone the repository with depth=1 for faster cloning
        this._reportProgress(`Cloning repository to ${repoPath}...`);
        const cloneArgs = ['clone', '--depth=1', authUrl, repoPath];
        execSync(`git ${cloneArgs.map(arg => JSON.stringify(arg)).join(' ')}`, {
          stdio: 'pipe',
          timeout: this.config.timeout,
        });
        this._reportProgress('Repository cloned successfully');
      }

      return repoPath;
    } catch (error) {
      // Provide more helpful error messages based on error output
      let errorMessage = `Failed to ${existsSync(repoPath) ? 'update' : 'clone'} repository: ${error.message}`;

      if (error.stderr) {
        const stderr = error.stderr.toString();
        if (stderr.includes('Authentication failed')) {
          errorMessage =
            'Authentication failed. Make sure you have the correct credentials for this repository.';
        } else if (stderr.includes('not found')) {
          errorMessage =
            'Repository not found. Check that the URL is correct and the repository exists.';
        } else if (stderr.includes('Permission denied')) {
          errorMessage =
            'Permission denied. You may not have access to this repository or SSH key issues.';
        } else if (stderr.includes('rate limit')) {
          errorMessage = 'GitHub API rate limit exceeded. Try authenticating with a token.';
        }
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Prepare authenticated URL for git operations
   * @param {string} repoUrl Original repository URL
   * @returns {string} URL with authentication if available
   */
  prepareAuthenticatedUrl(repoUrl) {
    // If no authentication is provided, return the original URL
    if (!this.config.auth.token && !(this.config.auth.username && this.config.auth.password)) {
      return repoUrl;
    }

    try {
      // Handle different URL formats (HTTPS or SSH)
      if (repoUrl.startsWith('https://')) {
        // For HTTPS URLs
        const url = new URL(repoUrl);

        if (this.config.auth.token) {
          // Use personal access token
          url.username = this.config.auth.token;
          url.password = 'x-oauth-basic';
        } else if (this.config.auth.username && this.config.auth.password) {
          // Use username and password
          url.username = this.config.auth.username;
          url.password = this.config.auth.password;
        }

        return url.toString();
      } else if (repoUrl.startsWith('git@')) {
        // For SSH URLs, we don't need to modify the URL as SSH keys are used
        return repoUrl;
      }
    } catch (error) {
      console.warn(`Warning: Could not prepare authenticated URL: ${error.message}`);
    }

    // If the URL format is not recognized or an error occurred, return the original URL
    return repoUrl;
  }

  /**
   * Get repository name from URL
   * @param {string} url GitHub repository URL
   * @returns {string} Repository name
   */
  getRepoNameFromUrl(url) {
    try {
      // Handle both HTTPS and SSH URLs
      let cleanUrl = url;
      if (cleanUrl.endsWith('.git')) {
        cleanUrl = cleanUrl.slice(0, -4);
      }

      // Extract the repository name based on URL format
      if (cleanUrl.startsWith('https://')) {
        // HTTPS URL format: https://github.com/username/repository
        const urlObj = new URL(cleanUrl);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        return pathParts.length >= 2 ? pathParts[1] : '';
      } else if (cleanUrl.startsWith('git@')) {
        // SSH URL format: git@github.com:username/repository
        const sshParts = cleanUrl.split(':');
        if (sshParts.length >= 2) {
          const pathParts = sshParts[1].split('/').filter(Boolean);
          return pathParts.length >= 1 ? pathParts[pathParts.length - 1] : '';
        }
      }

      // Fallback to the last path component
      const parts = cleanUrl.split('/');
      return parts[parts.length - 1];
    } catch (error) {
      console.warn(`Warning: Could not extract repository name from URL: ${error.message}`);

      // Last resort fallback - just use a timestamp
      return `repo-${Date.now()}`;
    }
  }

  /**
   * Process a directory recursively with concurrency control
   * @param {string} dirPath Directory path
   * @param {Object} config Configuration options
   * @param {string} relativePath Relative path from repository root
   * @returns {Promise<void>}
   */
  async processDirectory(dirPath, config, relativePath = '') {
    if (this.aborted) return;

    try {
      // Read directory entries
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Split entries into directories and files
      const directories = [];
      const files = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          directories.push(entry);
        } else if (entry.isFile()) {
          files.push(entry);
        }
      }

      // Process directories with limited concurrency
      const pendingDirs = [];
      let processedDirCount = 0;

      for (const entry of directories) {
        // Skip directories in the skipDirs list
        if (config.skipDirs.includes(entry.name)) {
          this._reportProgress(`Skipping directory: ${path.join(relativePath, entry.name)}`);
          continue;
        }

        const entryPath = path.join(dirPath, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name);

        // Process directory with concurrency control
        if (pendingDirs.length >= config.concurrency) {
          // Wait for one to complete before adding more
          await Promise.race(pendingDirs);
          // Remove completed promises
          for (let i = pendingDirs.length - 1; i >= 0; i--) {
            if (pendingDirs[i].status === 'fulfilled' || pendingDirs[i].status === 'rejected') {
              pendingDirs.splice(i, 1);
            }
          }
        }

        // Process subdirectory recursively
        const dirPromise = this.processDirectory(entryPath, config, entryRelativePath)
          .then(() => {
            processedDirCount++;
            dirPromise.status = 'fulfilled';
            this._reportProgress(
              `Processed directory ${processedDirCount}/${directories.length}: ${entryRelativePath}`
            );
          })
          .catch(error => {
            console.error(`Error processing directory ${entryRelativePath}:`, error.message);
            dirPromise.status = 'rejected';
          });

        dirPromise.status = 'pending';
        pendingDirs.push(dirPromise);
      }

      // Wait for all directories to be processed
      if (pendingDirs.length > 0) {
        await Promise.all(pendingDirs);
      }

      // Process files with concurrency
      const pendingFiles = [];
      let processedFileCount = 0;
      const totalFiles = files.length;

      for (const entry of files) {
        if (this.aborted) break;

        const entryPath = path.join(dirPath, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name);

        // Skip files in the skipFiles list
        if (config.skipFiles.includes(entry.name)) {
          this._reportProgress(`Skipping file: ${entryRelativePath}`);
          const stats = await fs.stat(entryPath);
          this.stats.skippedFiles++;
          this.stats.skippedSize += stats.size;
          continue;
        }

        // Get file stats
        const stats = await fs.stat(entryPath);

        // Skip files larger than maxFileSizeMB
        if (stats.size > config.maxFileSizeMB * 1024 * 1024) {
          this._reportProgress(
            `Skipping large file (${(stats.size / 1024 / 1024).toFixed(2)} MB): ${entryRelativePath}`
          );
          this.stats.skippedFiles++;
          this.stats.skippedSize += stats.size;
          continue;
        }

        // Skip files with extensions in skipExtensions
        const fileExt = path.extname(entry.name).toLowerCase();
        if (config.skipExtensions.includes(fileExt)) {
          this._reportProgress(`Skipping file with excluded extension: ${entryRelativePath}`);
          this.stats.skippedFiles++;
          this.stats.skippedSize += stats.size;
          continue;
        }

        // Process file with concurrency control
        if (pendingFiles.length >= config.concurrency) {
          // Wait for one to complete before adding more
          await Promise.race(pendingFiles);
          // Remove completed promises
          for (let i = pendingFiles.length - 1; i >= 0; i--) {
            if (pendingFiles[i].status === 'fulfilled' || pendingFiles[i].status === 'rejected') {
              pendingFiles.splice(i, 1);
            }
          }
        }

        // Process file
        const filePromise = this.processFile(entryPath, entryRelativePath, stats)
          .then(() => {
            processedFileCount++;
            filePromise.status = 'fulfilled';

            // Report progress every 10 files or for the last file
            if (processedFileCount % 10 === 0 || processedFileCount === totalFiles) {
              const progress = 0.2 + 0.7 * (processedFileCount / totalFiles);
              this._reportProgress(
                `Processed file ${processedFileCount}/${totalFiles}: ${entryRelativePath}`,
                progress
              );
            }
          })
          .catch(error => {
            console.error(`Error processing file ${entryRelativePath}:`, error.message);
            filePromise.status = 'rejected';
          });

        filePromise.status = 'pending';
        pendingFiles.push(filePromise);
        this.activePromises.add(filePromise);

        // Remove from active promises when done
        filePromise.finally(() => {
          this.activePromises.delete(filePromise);
        });
      }

      // Wait for all files to be processed
      if (pendingFiles.length > 0) {
        await Promise.all(pendingFiles);
      }
    } catch (error) {
      console.error(`Error processing directory ${relativePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Process a single file with binary detection
   * @param {string} filePath File path
   * @param {string} relativePath Relative path from repository root
   * @param {Object} stats File stats
   * @returns {Promise<void>}
   */
  async processFile(filePath, relativePath, stats) {
    if (this.aborted) {
      return Promise.resolve();
    }

    try {
      // First check if file is binary by reading the first chunk
      const fileHandle = await fs.open(filePath, 'r');

      try {
        // Read the first 8KB to detect if it's a binary file
        const buffer = Buffer.alloc(8192);
        const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);

        // Check if file is binary using signatures or null byte detection
        const isBinary = this.isBinaryFile(buffer.slice(0, bytesRead));

        if (isBinary) {
          this._reportProgress(`Skipping binary file: ${relativePath}`);
          this.stats.skippedFiles++;
          this.stats.skippedSize += stats.size;
          return;
        }

        // Read file content
        let content;

        if (stats.size > 1024 * 1024) {
          // For large files, read in chunks
          const chunks = [];
          const bufferSize = 1024 * 1024; // 1MB chunks
          const buffer = Buffer.alloc(bufferSize);
          let position = 0;
          let bytesRead = 0;

          do {
            const result = await fileHandle.read(buffer, 0, buffer.length, position);
            bytesRead = result.bytesRead;

            if (bytesRead > 0) {
              chunks.push(buffer.slice(0, bytesRead).toString('utf8'));
              position += bytesRead;
            }
          } while (bytesRead > 0 && position < stats.size);

          content = chunks.join('');
        } else {
          // For smaller files, read all at once
          content = await fs.readFile(filePath, 'utf8');
        }

        // Count lines in the content
        const lineCount = this._countLines(content);

        // Store file information
        this.files.push({
          path: relativePath,
          content,
          size: stats.size,
          lines: lineCount, // Add line count
          extension: path.extname(filePath).toLowerCase(),
          lastModified: stats.mtime,
        });

        // Calculate approximate token count (rough estimate based on whitespace and punctuation)
        const tokenCount = this._estimateTokenCount(content);

        // Make sure tokenCount is a number
        const safeTokenCount = isNaN(tokenCount) ? 0 : Number(tokenCount);

        // Store file information
        this.files[this.files.length - 1].tokenCount = safeTokenCount;

        // Update stats
        this.stats.totalFiles++;
        this.stats.totalSize += stats.size;

        // Defensive token counting implementation
        if (typeof this.stats.totalTokens !== 'number' || isNaN(this.stats.totalTokens)) {
          this.stats.totalTokens = 0; // Reset if not a valid number
        }
        this.stats.totalTokens += safeTokenCount;
      } finally {
        await fileHandle.close();
      }
    } catch (error) {
      this._reportProgress(`Error processing file ${relativePath}: ${error.message}`);
      this.stats.skippedFiles++;

      // Re-throw custom errors, swallow unhandled ones
      if (error.code === 'ENOENT') {
        console.warn(`Warning: File ${relativePath} no longer exists, skipping`);
      } else if (error.code === 'EACCES') {
        console.warn(`Warning: Permission denied for ${relativePath}, skipping`);
      } else {
        throw new Error(`Failed to process file ${relativePath}: ${error.message}`);
      }
    }
  }

  /**
   * Check if a file is binary using signatures and null byte detection
   * @param {Buffer} buffer File buffer to check
   * @returns {boolean} True if the file is binary
   */
  isBinaryFile(buffer) {
    // Check for binary file signatures (magic numbers)
    for (const { signature } of BINARY_FILE_SIGNATURES) {
      if (buffer.length >= signature.length) {
        let match = true;
        for (let i = 0; i < signature.length; i++) {
          if (buffer[i] !== signature[i]) {
            match = false;
            break;
          }
        }
        if (match) return true;
      }
    }

    // Check for null bytes (common in binary files)
    const MAX_CHECK_LENGTH = Math.min(buffer.length, 1024);
    let textCharCount = 0;
    let nullCount = 0;

    for (let i = 0; i < MAX_CHECK_LENGTH; i++) {
      const byte = buffer[i];

      // Count null bytes
      if (byte === 0) {
        nullCount++;
        // If more than 1 null byte in the first 1KB, likely binary
        if (nullCount > 1) return true;
      }

      // Count printable ASCII characters
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        textCharCount++;
      }
    }

    // If less than 80% are text characters, likely binary
    return textCharCount / MAX_CHECK_LENGTH < 0.8;
  }

  /**
   * Count lines in a string
   * @param {string} text - The text to count lines in
   * @returns {number} Line count
   * @private
   */
  _countLines(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.split('\n').length;
  }

  /**
   * Generate output in the requested format
   * @param {string} format Output format: text, json, or markdown
   * @returns {string|Object} Formatted output
   * @throws {Error} If the format is not supported
   */
  generateOutput(format) {
    if (!format || typeof format !== 'string') {
      format = 'text';
    }

    try {
      switch (format.toLowerCase()) {
        case 'json':
          return this.generateJsonOutput();
        case 'markdown':
          return this.generateMarkdownOutput();
        case 'text':
          return this.generateTextOutput();
        default:
          console.warn(`Warning: Unsupported format '${format}', defaulting to 'text'`);
          return this.generateTextOutput();
      }
    } catch (error) {
      console.error(`Error generating ${format} output:`, error.message);
      throw new Error(`Failed to generate ${format} output: ${error.message}`);
    }
  }

  /**
   * Generate JSON output
   * @returns {Object} JSON representation of the repository
   */
  generateJsonOutput() {
    // Create a clean deep copy without circular references
    const stats = {
      ...this.stats,
      elapsedTime: this.stats.elapsedTime || this.stats.endTime - this.stats.startTime || 0,
    };

    // Calculate total lines
    const totalLines = this.files.reduce((sum, file) => sum + (file.lines || 0), 0);

    // Sort files by path for consistent output
    const sortedFiles = [...this.files].sort((a, b) => a.path.localeCompare(b.path));

    // Create files array with clean data
    const processedFiles = sortedFiles.map(file => ({
      path: file.path,
      size: file.size,
      lines: file.lines || 0,
      extension: file.extension,
      lastModified: file.lastModified ? file.lastModified.toISOString() : new Date().toISOString(),
      content: file.content,
    }));

    return {
      files: processedFiles,
      stats: {
        ...stats,
        totalLines: totalLines,
      },
      meta: {
        generatedAt: new Date().toISOString(),
        version: '1.0.1',
        format: 'json',
        totalTokens: Number(this.stats.totalTokens || 0),
        totalLines: totalLines,
      },
    };
  }

  /**
   * Generate Markdown output
   * @returns {string} Markdown representation of the repository
   */
  generateMarkdownOutput() {
    // Calculate total lines
    const totalLines = this.files.reduce((sum, file) => sum + (file.lines || 0), 0);

    let output = '# Repository Content\n\n';
    output += `Generated at: ${new Date().toISOString()}\n\n`;
    output += `Total files: ${this.stats.totalFiles}\n`;
    output += `Total size: ${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB\n`;
    output += `Total lines: ${totalLines.toLocaleString()}\n`;
    output += `Total tokens: ${this._formatTokenCount(this.stats.totalTokens)}\n`;

    if (this.stats.elapsedTime) {
      output += `Processing time: ${(this.stats.elapsedTime / 1000).toFixed(2)} seconds\n`;
    }

    output += '\n## Table of Contents\n\n';

    // Group files by directory for TOC
    const filesByDir = {};
    this.files.forEach(file => {
      const dir = path.dirname(file.path);
      if (!filesByDir[dir]) {
        filesByDir[dir] = [];
      }
      filesByDir[dir].push(file);
    });

    // Generate table of contents
    Object.keys(filesByDir)
      .sort()
      .forEach(dir => {
        const dirTitle = dir === '.' ? 'Root Directory' : dir;
        const dirSlug = dirTitle.toLowerCase().replace(/[^\w]+/g, '-');

        output += `- [${dirTitle}](#${dirSlug})\n`;

        // Sort files within each directory
        filesByDir[dir].sort((a, b) => path.basename(a.path).localeCompare(path.basename(b.path)));

        filesByDir[dir].forEach(file => {
          const fileName = path.basename(file.path);
          const fileSlug = `${dirSlug}-${fileName.toLowerCase().replace(/[^\w]+/g, '-')}`;
          output += `  - [${fileName}](#${fileSlug})\n`;
        });
      });

    output += '\n';

    // Generate markdown for each directory
    Object.keys(filesByDir)
      .sort()
      .forEach(dir => {
        const dirTitle = dir === '.' ? 'Root Directory' : dir;
        output += `## ${dirTitle}\n\n`;

        // Sort files within each directory
        filesByDir[dir].sort((a, b) => path.basename(a.path).localeCompare(path.basename(b.path)));

        filesByDir[dir].forEach(file => {
          const fileName = path.basename(file.path);
          output += `### ${fileName}\n\n`;

          // Get the language for syntax highlighting
          const language = this.getLanguageFromExtension(file.extension);

          // Add metadata
          output += `**Path:** \`${file.path}\`  \n`;
          output += `**Size:** ${(file.size / 1024).toFixed(2)} KB  \n`;
          output += `**Lines:** ${(file.lines || 0).toLocaleString()}  \n`;

          if (file.lastModified) {
            const lastModified =
              typeof file.lastModified.toISOString === 'function'
                ? file.lastModified.toISOString()
                : new Date(file.lastModified).toISOString();
            output += `**Last Modified:** ${lastModified}  \n`;
          }

          output += '\n';

          // Add file content with syntax highlighting
          output += '```' + language + '\n';
          output += file.content + '\n';
          output += '```\n\n';
        });
      });

    return output;
  }

  /**
   * Generate plain text output
   * @returns {string} Text representation of the repository
   */
  generateTextOutput() {
    // Calculate total lines
    const totalLines = this.files.reduce((sum, file) => sum + (file.lines || 0), 0);

    let output = 'REPOSITORY CONTENT\n';
    output += '='.repeat(20) + '\n\n';

    output += `Generated at: ${new Date().toISOString()}\n\n`;
    output += `Total files: ${this.stats.totalFiles}\n`;
    output += `Total size: ${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB\n`;
    output += `Total lines: ${totalLines.toLocaleString()}\n`;
    output += `Total tokens: ${this._formatTokenCount(this.stats.totalTokens)}\n`;

    if (this.stats.elapsedTime) {
      output += `Processing time: ${(this.stats.elapsedTime / 1000).toFixed(2)} seconds\n`;
    }

    output += '\n';

    // Sort files by path
    const sortedFiles = [...this.files].sort((a, b) => a.path.localeCompare(b.path));

    // Generate text for each file
    sortedFiles.forEach(file => {
      output += `FILE: ${file.path}\n`;
      output += '='.repeat(Math.min(file.path.length + 6, 80)) + '\n';

      // Add file metadata
      output += `Size: ${(file.size / 1024).toFixed(2)} KB\n`;
      output += `Lines: ${(file.lines || 0).toLocaleString()}\n`;

      if (file.lastModified) {
        const lastModified =
          typeof file.lastModified.toISOString === 'function'
            ? file.lastModified.toISOString()
            : new Date(file.lastModified).toISOString();
        output += `Last Modified: ${lastModified}\n`;
      }

      output += '-'.repeat(Math.min(file.path.length + 6, 80)) + '\n\n';
      output += file.content + '\n\n\n';
    });

    return output;
  }

  /**
   * Get language identifier from file extension for markdown code blocks
   * @param {string} extension File extension
   * @returns {string} Language identifier
   */
  getLanguageFromExtension(extension) {
    if (!extension) {
      return '';
    }

    // Normalize extension (ensure it starts with dot and is lowercase)
    const normalizedExt = extension.startsWith('.')
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`;

    const extensionMap = {
      // JavaScript and TypeScript
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.mjs': 'javascript',
      '.cjs': 'javascript',

      // Web
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'scss',
      '.less': 'less',
      '.svg': 'svg',

      // Data formats
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.csv': 'csv',

      // Markdown and documentation
      '.md': 'markdown',
      '.markdown': 'markdown',
      '.rst': 'rst',
      '.tex': 'tex',
      '.adoc': 'asciidoc',

      // Shell and scripts
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'bash',
      '.fish': 'fish',
      '.bat': 'batch',
      '.cmd': 'batch',
      '.ps1': 'powershell',

      // Programming languages
      '.py': 'python',
      '.rb': 'ruby',
      '.php': 'php',
      '.go': 'go',
      '.java': 'java',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.cs': 'csharp',
      '.fs': 'fsharp',
      '.vb': 'vb',
      '.c': 'c',
      '.h': 'c',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.hpp': 'cpp',
      '.rs': 'rust',
      '.swift': 'swift',
      '.dart': 'dart',
      '.lua': 'lua',
      '.pl': 'perl',
      '.elm': 'elm',
      '.erl': 'erlang',
      '.ex': 'elixir',
      '.exs': 'elixir',
      '.hs': 'haskell',
      '.clj': 'clojure',
      '.r': 'r',

      // Database
      '.sql': 'sql',

      // Config files
      '.gitignore': 'gitignore',
      '.dockerignore': 'dockerfile',
      '.dockerfile': 'dockerfile',
      '.editorconfig': 'ini',
      '.env': 'shell',

      // Others
      '.graphql': 'graphql',
      '.proto': 'protobuf',
    };

    return extensionMap[normalizedExt] || '';
  }

  /**
   * Save output to a file
   * @param {string|Object} output - The output content
   * @param {string} outputPath - The file path to save to
   * @returns {Promise<string>} The actual path where the file was saved
   */
  async saveToFile(output, outputPath) {
    // Normalize path for cross-platform compatibility
    let normalizedPath = path.normalize(outputPath);

    // Add datetime to filename
    const actualOutputPath = this._addDateTimeToFilename(normalizedPath);

    // Ensure directory exists
    const outputDir = path.dirname(actualOutputPath);
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (err) {
      // Handle the case where the directory already exists
      if (err.code !== 'EEXIST') throw err;
    }

    // Write file
    await fs.writeFile(
      actualOutputPath,
      typeof output === 'string' ? output : JSON.stringify(output, null, 2)
    );

    return actualOutputPath;
  }
}

// Browser compatibility wrapper
let isNode = false;
try {
  isNode =
    typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
} catch (e) {
  // Not Node.js
}

/**
 * Browser-compatible version that uses the GitHub API
 */
class BrowserRepoCombiner extends RepoCombiner {
  /**
   * Create a new BrowserRepoCombiner instance
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    super(config);

    // Browser-specific properties
    this.apiRequestCount = 0;
    this.apiRateLimit = {
      limit: 60, // Default GitHub API rate limit for unauthenticated requests
      remaining: 60,
      reset: 0,
    };
    this.pendingRequests = new Map();
    this.cachedResponses = new Map();
  }

  /**
   * Clone the GitHub repository using the GitHub API
   * @param {string} repoUrl GitHub repository URL
   * @param {string} targetDir Not used in browser version
   * @returns {Promise<Object>} Repository contents
   * @throws {Error} If repository cannot be fetched
   */
  async cloneRepository(repoUrl) {
    try {
      // Validate and extract owner and repo from URL
      if (!repoUrl.includes('github.com')) {
        throw new Error('Only GitHub repositories are supported in browser mode');
      }

      // Parse the URL correctly handling various formats
      let owner, repo;

      if (repoUrl.startsWith('https://')) {
        // Handle HTTPS URL
        const url = new URL(repoUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);

        if (pathParts.length < 2) {
          throw new Error('Invalid GitHub repository URL format');
        }

        owner = pathParts[0];
        repo = pathParts[1].replace(/\.git$/, '');
      } else if (repoUrl.startsWith('git@')) {
        // Handle SSH URL
        const match = repoUrl.match(/git@github\.com:([^/]+)\/([^/]+)(\.git)?$/);
        if (!match) {
          throw new Error('Invalid GitHub SSH URL format');
        }

        owner = match[1];
        repo = match[2].replace(/\.git$/, '');
      } else {
        throw new Error('Unsupported URL format. Use HTTPS or SSH GitHub URLs');
      }

      if (!owner || !repo) {
        throw new Error('Could not extract owner and repository name from URL');
      }

      this._reportProgress(`Fetching repository: ${owner}/${repo}`, 0.1, 'fetching');

      // Get repository metadata to verify it exists and check if it's private
      await this._checkRepository(owner, repo);

      // Fetch repository contents recursively with concurrency control
      this._reportProgress('Fetching repository contents...', 0.2, 'fetching');
      const repoContents = await this.fetchRepoContents(owner, repo);

      return { owner, repo, contents: repoContents };
    } catch (error) {
      // Enhance error message based on error type
      if (error.status === 404) {
        throw new Error(
          `Repository not found: ${repoUrl}. Check if the URL is correct and the repository exists.`
        );
      } else if (error.status === 403 && error.message.includes('rate limit')) {
        const resetDate = new Date(this.apiRateLimit.reset * 1000);
        throw new Error(
          `GitHub API rate limit exceeded. Wait until ${resetDate.toLocaleTimeString()} or authenticate with a token.`
        );
      } else if (error.status === 401) {
        throw new Error('Authentication failed. Check your credentials or token.');
      } else {
        throw new Error(`Failed to fetch repository: ${error.message}`);
      }
    }
  }

  /**
   * Check if a repository exists and is accessible
   * @param {string} owner Repository owner
   * @param {string} repo Repository name
   * @private
   */
  async _checkRepository(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const response = await this._fetchWithAuth(url);

    if (!response.ok) {
      const error = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    const repoInfo = await response.json();

    // Check if repository is private and we have authentication
    if (repoInfo.private && !this._hasAuth()) {
      throw new Error(
        'This repository is private. You need to provide authentication to access it.'
      );
    }

    return repoInfo;
  }

  /**
   * Check if authentication is configured
   * @returns {boolean} True if authentication is configured
   * @private
   */
  _hasAuth() {
    return Boolean(
      this.config.auth.token || (this.config.auth.username && this.config.auth.password)
    );
  }

  /**
   * Fetch with authentication and rate limit handling
   * @param {string} url URL to fetch
   * @param {Object} options Fetch options
   * @returns {Promise<Response>} Fetch response
   * @private
   */
  async _fetchWithAuth(url, options = {}) {
    // Prepare headers with authentication if available
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'repo-combiner',
    };

    // Add authentication headers if available
    if (this.config.auth.token) {
      headers['Authorization'] = `token ${this.config.auth.token}`;
    } else if (this.config.auth.username && this.config.auth.password) {
      try {
        // Use cross-browser compatible approach for base64 encoding
        const base64Auth = this._base64Encode(
          `${this.config.auth.username}:${this.config.auth.password}`
        );
        headers['Authorization'] = `Basic ${base64Auth}`;
      } catch (error) {
        console.warn('Warning: Failed to encode authentication credentials', error);
      }
    }

    // Merge user-provided options with our defaults
    const fetchOptions = {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    };

    // Check if this request is already in progress
    const cacheKey = `${url}:${JSON.stringify(fetchOptions)}`;

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    // Check if response is in cache
    if (this.cachedResponses.has(cacheKey)) {
      return Promise.resolve(this.cachedResponses.get(cacheKey).clone());
    }

    // Create a new request promise
    const requestPromise = new Promise((resolve, reject) => {
      // Implement retry logic with exponential backoff
      let retries = 3;
      let delay = 1000; // Start with 1 second delay

      const executeRequest = async () => {
        try {
          while (retries >= 0) {
            try {
              const response = await fetch(url, fetchOptions);

              // Update rate limit information from headers
              const rateLimit = response.headers.get('x-ratelimit-limit');
              const rateRemaining = response.headers.get('x-ratelimit-remaining');
              const rateReset = response.headers.get('x-ratelimit-reset');

              if (rateLimit && rateRemaining && rateReset) {
                this.apiRateLimit = {
                  limit: parseInt(rateLimit, 10),
                  remaining: parseInt(rateRemaining, 10),
                  reset: parseInt(rateReset, 10),
                };

                // Pre-emptively warn user when approaching rate limit
                if (parseInt(rateRemaining, 10) < 10 && !this._hasAuth()) {
                  const resetDate = new Date(parseInt(rateReset, 10) * 1000);
                  const formattedTime = resetDate.toLocaleTimeString();
                  this._reportProgress(
                    `⚠️ Warning: GitHub API rate limit almost reached (${rateRemaining}/${rateLimit} remaining). ` +
                      `Limit will reset at ${formattedTime}. ` +
                      'Consider authenticating for higher limits.',
                    undefined,
                    'warning'
                  );
                }
              }

              // Handle rate limiting
              if (
                response.status === 403 &&
                response.headers.get('x-ratelimit-remaining') === '0'
              ) {
                const resetTime = parseInt(response.headers.get('x-ratelimit-reset'), 10) * 1000;
                const waitTime = resetTime - Date.now();
                const resetDate = new Date(resetTime);

                if (waitTime > 0 && waitTime < 60000 && retries > 0) {
                  // Wait for rate limit reset if it's reasonable (less than a minute)
                  this._reportProgress(
                    `Rate limit exceeded, waiting ${Math.ceil(waitTime / 1000)} seconds until ${resetDate.toLocaleTimeString()}...`,
                    undefined,
                    'waiting'
                  );
                  await new Promise(r => setTimeout(r, waitTime));
                  retries--;
                  continue;
                } else {
                  // Otherwise, throw an error with detailed information
                  const error = new Error(
                    `GitHub API rate limit exceeded. Limit of ${rateLimit} requests ` +
                      `will reset at ${resetDate.toLocaleTimeString()} ` +
                      `(in ${Math.ceil(waitTime / 1000 / 60)} minutes). ` +
                      'To avoid this error, authenticate with a GitHub token.'
                  );
                  error.status = 403;
                  error.resetTime = resetTime;
                  error.resetDate = resetDate;
                  throw error;
                }
              }

              // Cache successful responses
              if (response.ok) {
                // We need to clone the response since it can only be consumed once
                this.cachedResponses.set(cacheKey, response.clone());
              }

              resolve(response);
              return;
            } catch (error) {
              if (
                retries > 0 &&
                (error.message.includes('network') || error.message.includes('failed'))
              ) {
                // Network error, retry with exponential backoff
                this._reportProgress(
                  `Network error, retrying in ${delay / 1000} seconds...`,
                  undefined,
                  'retrying'
                );
                await new Promise(r => setTimeout(r, delay));
                delay *= 2; // Exponential backoff
                retries--;
              } else {
                throw error;
              }
            }
          }
        } catch (error) {
          reject(error);
        } finally {
          // Remove from pending requests
          this.pendingRequests.delete(cacheKey);
        }
      };

      // Start the request process
      executeRequest();
    });

    // Store the pending request
    this.pendingRequests.set(cacheKey, requestPromise);

    return requestPromise;
  }

  /**
   * Cross-browser compatible base64 encoding
   * @param {string} str String to encode
   * @returns {string} Base64 encoded string
   * @private
   */
  _base64Encode(str) {
    // Try using btoa first (most browsers)
    if (typeof btoa === 'function') {
      return btoa(str);
    }

    // Fallback implementation for environments without btoa
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';

    for (
      let block = 0, charCode, i = 0, map = chars;
      str.charAt(i | 0) || ((map = '='), i % 1);
      output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
    ) {
      charCode = str.charCodeAt((i += 3 / 4));

      if (charCode > 0xff) {
        throw new Error(
          'The string to be encoded contains characters outside of the Latin1 range.'
        );
      }

      block = (block << 8) | charCode;
    }

    return output;
  }

  /**
   * Fetch repository contents recursively using GitHub API with concurrency control
   * @param {string} owner Repository owner
   * @param {string} repo Repository name
   * @param {string} path Path within repository
   * @returns {Promise<Array>} Repository contents
   */
  async fetchRepoContents(owner, repo, path = '') {
    if (this.aborted) {
      return [];
    }

    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

      const response = await this._fetchWithAuth(url);

      if (!response.ok) {
        const error = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        error.status = response.status;

        // Enhanced error handling for different status codes
        if (response.status === 403) {
          const body = await response.json().catch(() => ({}));
          if (body.message && body.message.includes('rate limit')) {
            // Rate limit error with more details from response body
            error.message = `GitHub API rate limit exceeded: ${body.message}`;
            error.isRateLimit = true;

            // Try to get the remaining rate limit info from the response body
            if (body.documentation_url) {
              error.documentationUrl = body.documentation_url;
            }
          } else if (body.message && body.message.includes('abuse')) {
            // Secondary rate limit (abuse detection)
            error.message = `GitHub API secondary rate limit triggered: ${body.message}`;
            error.isSecondaryRateLimit = true;
          }
        } else if (response.status === 404) {
          error.message = `Repository path not found: ${path || 'root'}. The repository might be private or not exist.`;
        } else if (response.status === 401) {
          error.message = 'Authentication failed. Check your credentials or token.';
        } else if (response.status >= 500) {
          error.message = `GitHub server error (${response.status}). Try again later.`;
        }

        throw error;
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        // This is a directory
        const contents = [];

        // Group items into directories and files
        const directories = [];
        const files = [];

        for (const item of data) {
          if (item.type === 'dir' && !this.config.skipDirs.includes(item.name)) {
            directories.push(item);
          } else if (item.type === 'file' && !this.config.skipFiles.includes(item.name)) {
            // Skip files with extensions in skipExtensions
            const fileExt = this._getFileExtension(item.name).toLowerCase();
            if (!this.config.skipExtensions.includes(fileExt)) {
              files.push(item);
            } else {
              this._reportProgress(`Skipping excluded file extension: ${item.path}`);
              this.stats.skippedFiles++;
            }
          }
        }

        // Process directories with concurrency control
        let processedDirCount = 0;
        const totalDirs = directories.length;

        // Pre-warn if large number of directories to process
        if (totalDirs > 50) {
          this._reportProgress(
            `Processing large repository with ${totalDirs} directories. This may take some time...`,
            undefined,
            'info'
          );
        }

        for (let i = 0; i < directories.length; i += this.config.concurrency) {
          const batch = directories.slice(i, i + this.config.concurrency);

          const batchPromises = batch.map(item => {
            return this.fetchRepoContents(owner, repo, item.path)
              .then(subContents => {
                processedDirCount++;
                this._reportProgress(
                  `Processed directory ${processedDirCount}/${totalDirs}: ${item.path}`,
                  0.2 + 0.4 * (processedDirCount / totalDirs),
                  'fetching'
                );
                return subContents;
              })
              .catch(error => {
                // Handle directory-specific errors gracefully
                console.warn(`Warning: Error processing directory ${item.path}: ${error.message}`);

                // Special handling for rate limit errors - need to propagate these
                if (error.isRateLimit || error.isSecondaryRateLimit) {
                  throw error;
                }

                return [];
              });
          });

          try {
            const results = await Promise.all(batchPromises);

            for (const subContents of results) {
              contents.push(...subContents);
            }
          } catch (error) {
            // If it's a rate limit error, propagate it
            if (error.isRateLimit || error.isSecondaryRateLimit) {
              throw error;
            }
            console.error(`Error processing batch of directories: ${error.message}`);
          }

          if (this.aborted) break;
        }

        // Process files with concurrency control
        let processedFileCount = 0;
        const totalFiles = files.length;

        for (let i = 0; i < files.length; i += this.config.concurrency) {
          if (this.aborted) break;

          const batch = files.slice(i, i + this.config.concurrency);

          const batchPromises = batch.map(item => {
            return this._processFileItem(item)
              .then(fileObject => {
                processedFileCount++;

                // Report progress periodically to avoid flooding
                if (processedFileCount % 5 === 0 || processedFileCount === totalFiles) {
                  this._reportProgress(
                    `Processed file ${processedFileCount}/${totalFiles}: ${item.path}`,
                    0.6 + 0.3 * (processedFileCount / totalFiles),
                    'fetching'
                  );
                }

                return fileObject;
              })
              .catch(error => {
                console.warn(`Warning: Failed to process file ${item.path}: ${error.message}`);

                // Special handling for rate limit errors - need to propagate these
                if (error.isRateLimit || error.isSecondaryRateLimit) {
                  throw error;
                }

                return null;
              });
          });

          try {
            const results = await Promise.all(batchPromises);

            for (const fileObject of results) {
              if (fileObject) {
                contents.push(fileObject);
              }
            }
          } catch (error) {
            // If it's a rate limit error, propagate it
            if (error.isRateLimit || error.isSecondaryRateLimit) {
              throw error;
            }
            console.error(`Error processing batch of files: ${error.message}`);
          }
        }

        return contents;
      } else {
        // This is a single file (direct API call to a file path)
        const fileObject = await this._processFileItem(data);
        return fileObject ? [fileObject] : [];
      }
    } catch (error) {
      // Enhance the error with more context
      if (error.isRateLimit || error.isSecondaryRateLimit) {
        // Propagate rate limit errors with custom user-friendly message
        const enhancedError = new Error(
          `GitHub API rate limit exceeded while fetching ${path || 'repository root'}. ` +
            'To increase your rate limit, authenticate with a GitHub token. ' +
            `${error.message}`
        );
        enhancedError.isRateLimit = error.isRateLimit;
        enhancedError.isSecondaryRateLimit = error.isSecondaryRateLimit;
        enhancedError.documentationUrl = error.documentationUrl;
        throw enhancedError;
      }

      console.error(`Error fetching ${path || 'repository root'}:`, error.message);

      // Don't throw for individual directory errors, just return empty array
      if (path !== '') {
        console.warn(`Skipping directory: ${path}`);
        return [];
      }

      throw error;
    }
  }

  /**
   * Process a single file item from the GitHub API
   * @param {Object} item File item from GitHub API
   * @param {string} owner Repository owner
   * @param {string} repo Repository name
   * @returns {Promise<Object>} Processed file object
   * @private
   */
  async _processFileItem(item) {
    // Skip files larger than maxFileSizeMB
    if (item.size > this.config.maxFileSizeMB * 1024 * 1024) {
      this._reportProgress(
        `Skipping large file (${(item.size / 1024 / 1024).toFixed(2)} MB): ${item.path}`
      );
      this.stats.skippedFiles++;
      this.stats.skippedSize += item.size;
      return null;
    }

    // Get file extension using browser-compatible approach
    const fileExt = this._getFileExtension(item.name).toLowerCase();

    // Skip binary files based on known binary extensions
    for (const { extension } of BINARY_FILE_SIGNATURES) {
      if (fileExt === extension) {
        this._reportProgress(`Skipping binary file: ${item.path}`);
        this.stats.skippedFiles++;
        this.stats.skippedSize += item.size;
        return null;
      }
    }

    try {
      // Use raw download URL to fetch content
      const fileResponse = await this._fetchWithAuth(item.download_url);

      if (!fileResponse.ok) {
        throw new Error(
          `Failed to fetch file content: ${fileResponse.status} ${fileResponse.statusText}`
        );
      }

      const content = await fileResponse.text();

      // Detect if this is a binary file by checking for null bytes
      if (content.includes('\0')) {
        this._reportProgress(`Skipping binary file: ${item.path}`);
        this.stats.skippedFiles++;
        this.stats.skippedSize += item.size;
        return null;
      }

      // Calculate token count for browser implementation
      const tokenCount = this._estimateTokenCount(content);
      const safeTokenCount = isNaN(tokenCount) ? 0 : Number(tokenCount);

      // Add to total token count - defensively handle possible NaN
      if (typeof this.stats.totalTokens !== 'number' || isNaN(this.stats.totalTokens)) {
        this.stats.totalTokens = 0; // Reset if not a valid number
      }
      this.stats.totalTokens += safeTokenCount;

      return {
        path: item.path,
        content,
        size: item.size,
        extension: fileExt,
        tokenCount: safeTokenCount,
        lastModified: new Date().toISOString(), // GitHub API doesn't provide last modified date
      };
    } catch (error) {
      console.warn(`Warning: Failed to fetch file content for ${item.path}: ${error.message}`);
      this.stats.skippedFiles++;
      return null;
    }
  }

  /**
   * Get file extension in a browser-compatible way
   * @param {string} filename File name
   * @returns {string} File extension with dot (e.g., '.js')
   * @private
   */
  _getFileExtension(filename) {
    if (!filename) return '';
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex);
  }

  /**
   * Process a repository in browser environment
   * @param {string} repoUrl GitHub repository URL
   * @param {Object} options Processing options
   * @returns {Promise<string|Object>} Combined repository content
   */
  async processRepo(repoUrl, options = {}) {
    // Call the parent's processRepo first to handle validation and setup
    // but override the actual implementation
    const config = { ...this.config, ...options };
    this.config = config;

    // Reset state for new processing
    this.files = [];
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      skippedFiles: 0,
      skippedSize: 0,
      startTime: Date.now(),
      endTime: null,
      elapsedTime: 0,
    };
    this.aborted = false;
    this.apiRequestCount = 0;
    this.cachedResponses.clear();
    this.pendingRequests.clear();

    try {
      this._reportProgress(`Processing repository: ${repoUrl}`, 0, 'initializing');

      // Fetch repository contents
      const repoData = await this.cloneRepository(repoUrl);

      // Store valid files (non-null values)
      this.files = repoData.contents.filter(Boolean);

      // Update stats
      this.stats.totalFiles = this.files.length;
      this.stats.totalSize = this.files.reduce((total, file) => total + file.size, 0);
      this.stats.totalTokens = this.files.reduce(
        (total, file) => total + (file.tokenCount || 0),
        0
      );

      // Generate output in the requested format
      this._reportProgress('Generating output...', 0.9, 'generating');
      const output = this.generateOutput(config.format);

      // Update final stats
      this.stats.endTime = Date.now();
      this.stats.elapsedTime = this.stats.endTime - this.stats.startTime;

      const summaryMessage = `
Repository processing completed:
- Total files processed: ${this.stats.totalFiles}
- Total size: ${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB
- Total tokens: ${this._formatTokenCount(this.stats.totalTokens)}
- Skipped files: ${this.stats.skippedFiles}
- Skipped size: ${(this.stats.skippedSize / 1024 / 1024).toFixed(2)} MB
- API requests: ${this.apiRequestCount}
- Processing time: ${(this.stats.elapsedTime / 1000).toFixed(2)} seconds
      `;

      this._reportProgress('Processing complete', 1, 'complete');
      console.log(summaryMessage);

      return output;
    } catch (error) {
      this.stats.endTime = Date.now();
      this.stats.elapsedTime = this.stats.endTime - this.stats.startTime;

      this._reportProgress(`Error: ${error.message}`, undefined, 'error');

      // Clean up any pending promises
      for (const [key, promise] of this.pendingRequests.entries()) {
        if (promise.cancel && typeof promise.cancel === 'function') {
          promise.cancel();
        }
        this.pendingRequests.delete(key);
      }

      throw error;
    }
  }
}

/**
 * Create a repository combiner instance
 * @param {Object} config Configuration options
 * @returns {RepoCombiner|BrowserRepoCombiner} Repository combiner instance
 */
export function createRepoCombiner(config = {}) {
  return isNode ? new RepoCombiner(config) : new BrowserRepoCombiner(config);
}

// Export module
export default {
  RepoCombiner,
  BrowserRepoCombiner,
  createRepoCombiner,
  version: '1.0.1',
};
