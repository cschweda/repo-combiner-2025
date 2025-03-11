#!/usr/bin/env node

import path from 'path';
import fs from 'fs/promises';
import minimist from 'minimist';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { createRepoCombiner } from '../src/repo-combiner.js';
import { createLogger } from '../src/logger.js';
import readline from 'readline';

// Make the module work in both ESM and CommonJS environments
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine project root directory (one level up from bin directory)
const projectRoot = path.resolve(__dirname, '..');

// Create logger
const logger = createLogger({
  name: 'cli',
  logDir: path.join(projectRoot, 'logs'),
  logLevel: process.env.LOG_LEVEL || 'INFO',
  enableConsole: true, 
  enableFileLogging: true
});

// Log CLI startup
logger.info('Repo-combiner CLI starting up', { 
  path: __filename,
  nodeVersion: process.version,
  platform: process.platform
});

// Load environment variables from .env file
dotenv.config();

// Check for authentication environment variables and print a warning if not found
if (!process.env.GITHUB_TOKEN && !(process.env.GITHUB_USERNAME && process.env.GITHUB_PASSWORD)) {
  logger.warn('No GitHub authentication found in environment variables', {
    authCheck: 'failed',
    hasToken: !!process.env.GITHUB_TOKEN,
    hasCredentials: !!(process.env.GITHUB_USERNAME && process.env.GITHUB_PASSWORD)
  });
  console.warn('\n⚠️  Warning: No GitHub authentication found in environment variables.');
  console.warn('   For private repositories, create a .env file with GitHub credentials.');
  console.warn('   See .env.sample for more information.\n');
} else {
  logger.info('GitHub authentication found in environment variables', {
    authCheck: 'passed',
    hasToken: !!process.env.GITHUB_TOKEN,
    hasCredentials: !!(process.env.GITHUB_USERNAME && process.env.GITHUB_PASSWORD)
  });
}

/**
 * Show CLI help
 */
function showHelp() {
  const helpText = `
Usage: repo-combiner [options] <repository-url>

Options:
  -h, --help                  Show this help
  -v, --version               Show version
  -f, --format <type>         Output format: text, json, or markdown (default: text)
  -o, --output <file>         Write output to file (default: output/output.txt)
  -k, --keep-temp             Keep temporary files
  -t, --token <token>         GitHub personal access token (for private repositories)
  -u, --username <username>   GitHub username (for private repositories)
  -p, --password <password>   GitHub password (for private repositories)
  --log-level <level>         Set log level (ERROR, WARN, INFO, DEBUG, TRACE) (default: INFO)
  --log-file <file>           Custom log file path

Authentication:
  For private repositories, you can provide authentication in three ways:
  1. Set GITHUB_TOKEN in .env file (recommended)
  2. Set GITHUB_USERNAME and GITHUB_PASSWORD in .env file
  3. Use the --token or --username/--password flags

Examples:
  repo-combiner https://github.com/user/repo
  repo-combiner -f markdown -o output/repo.md https://github.com/user/repo
  repo-combiner --format json --output output/repo.json https://github.com/user/repo
  repo-combiner --token ghp_xxxxxxxxxxxx https://github.com/user/private-repo
  repo-combiner --log-level DEBUG https://github.com/user/repo
  `;
  
  console.log(helpText);
  logger.info('Help displayed to user');
}

/**
 * Create a readline interface for user prompts
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask user for repository URL
 * @param {string} defaultRepoUrl Default repository URL
 * @returns {Promise<string>} Selected repository URL
 */
async function promptForRepository(defaultRepoUrl) {
  const rl = createPrompt();

  return new Promise(resolve => {
    rl.question(`Use default repository (${defaultRepoUrl})? [Y/n] `, answer => {
      if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        rl.question('Enter repository URL: ', repoUrl => {
          rl.close();
          resolve(repoUrl.trim());
        });
      } else {
        rl.close();
        resolve(defaultRepoUrl);
      }
    });
  });
}

/**
 * Ask user for output format
 * @param {string} defaultFormat Default output format
 * @returns {Promise<string>} Selected output format
 */
async function promptForFormat(defaultFormat) {
  const rl = createPrompt();
  const validFormats = ['text', 'markdown', 'json'];

  return new Promise(resolve => {
    rl.question(
      `Select output format [text/markdown/json] (default: ${defaultFormat}): `,
      answer => {
        rl.close();
        const format = answer.trim().toLowerCase();
        if (!format || !validFormats.includes(format)) {
          resolve(defaultFormat);
        } else {
          resolve(format);
        }
      }
    );
  });
}

/**
 * Format a datetime string for filenames (YYYY-MM-DD_HH-MM-SS)
 * @returns {string} Formatted datetime string
 */
function getFormattedDateTime() {
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
 */
function addDateTimeToFilename(filename) {
  const dateTime = getFormattedDateTime();
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const dir = path.dirname(filename);
  return path.join(dir, `${base}_${dateTime}${ext}`);
}

/**
 * Ensure required directories exist
 */
async function ensureDirectoriesExist() {
  // Define the directories that should exist
  const requiredDirs = [path.join(projectRoot, 'output'), path.join(projectRoot, 'bin', 'output')];

  // Create each directory if it doesn't exist
  for (const dir of requiredDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      // Ignore errors if directory already exists
      if (err.code !== 'EEXIST') {
        console.warn(`Warning: Could not create directory ${dir}: ${err.message}`);
      }
    }
  }
}

/**
 * Command-line interface
 */
async function cli() {
  // Ensure output directories exist before starting
  await ensureDirectoriesExist();
  
  logger.debug('Parsing command line arguments');
  const argv = minimist(process.argv.slice(2), {
    string: ['format', 'output', 'token', 'username', 'password', 'log-level', 'log-file'],
    boolean: ['help', 'version', 'keep-temp'],
    alias: {
      h: 'help',
      v: 'version',
      f: 'format',
      o: 'output',
      k: 'keep-temp',
      t: 'token',
      u: 'username',
      p: 'password',
    },
    default: {
      format: 'text',
      output: path.join(projectRoot, 'output', 'output'), // Using just base name without extension
      'keep-temp': false,
      token: process.env.GITHUB_TOKEN || '',
      username: process.env.GITHUB_USERNAME || '',
      password: process.env.GITHUB_PASSWORD || '',
      'log-level': process.env.LOG_LEVEL || 'INFO',
    },
  });
  
  // Override log level if specified
  if (argv['log-level']) {
    logger.setLogLevel(argv['log-level']);
    logger.info(`Log level set to ${argv['log-level']}`);
  }
  
  // Use custom log file if specified
  if (argv['log-file']) {
    const customLogDir = path.dirname(argv['log-file']);
    const customLogName = path.basename(argv['log-file']);
    logger.logDir = customLogDir;
    logger.name = customLogName;
    logger._setupLogFile();
    logger.info(`Using custom log file: ${argv['log-file']}`);
  }

  // Show help
  if (argv.help) {
    showHelp();
    return;
  }

  // Show version
  if (argv.version) {
    try {
      const packageJsonPath = path.resolve(__dirname, '../package.json');
      logger.debug(`Reading package.json from ${packageJsonPath}`);
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const version = packageJson.version;
      logger.info(`Displaying version: ${version}`);
      console.log(`repo-combiner v${version}`);
    } catch (error) {
      logger.error(`Failed to read package.json: ${error.message}`, {
        path: path.resolve(__dirname, '../package.json'),
        error: error.message,
      });
      console.error('Error reading package.json:', error.message);
      console.log('repo-combiner v1.0.0');
    }
    return;
  }

  // Default repository URL for this project
  const defaultRepoUrl = 'https://github.com/cschweda/repo-combiner-2025';
  logger.debug(`Using default repository URL: ${defaultRepoUrl}`);

  // Check for repository URL from arguments
  let repoUrl = argv._[0];
  logger.debug(`Repository URL from arguments: ${repoUrl || 'none'}`);

  // If no repository URL is provided via arguments, prompt the user
  if (!repoUrl) {
    logger.info('No repository URL provided, prompting user');
    repoUrl = await promptForRepository(defaultRepoUrl);
    logger.info(`User selected repository URL: ${repoUrl}`);
  }

  // Prompt for format if not specified in arguments and not in non-interactive mode
  let format = argv.format;
  if (format === 'text' && !argv.output && process.stdin.isTTY) {
    logger.debug('Prompting for output format');
    format = await promptForFormat('text');
    logger.info(`User selected format: ${format}`);
  }

  // Validate format
  const validFormats = ['text', 'markdown', 'json'];
  if (!validFormats.includes(format)) {
    const errorMsg = `Invalid format '${format}'. Valid formats are: ${validFormats.join(', ')}`;
    logger.error(errorMsg);
    console.error(`Error: ${errorMsg}`);
    return;
  }

  // Validate repository URL
  if (!repoUrl.match(/^(https?:\/\/|git@)([a-zA-Z0-9-]+\.)+[a-zA-Z0-9]{2,}(\/|:)[^\s]+\/[^\s]+$/)) {
    const errorMsg = 'Invalid repository URL format';
    logger.error(errorMsg, { url: repoUrl });
    console.error('Error: Invalid repository URL format');
    console.error(
      'Expected format: https://github.com/username/repository or git@github.com:username/repository'
    );
    return;
  }
  
  logger.info('Validated inputs', { repoUrl, format, outputPath: argv.output });

  // Process repository
  logger.info('Initializing RepoCombiner', {
    format,
    keepTemp: argv['keep-temp'],
    hasAuth: !!(argv.token || (argv.username && argv.password))
  });
  
  const repoCombiner = createRepoCombiner({
    format: format,
    keepTemp: argv['keep-temp'],
    auth: {
      token: argv.token,
      username: argv.username,
      password: argv.password,
    },
    onProgress: status => {
      if (status.message) {
        console.log(status.message);
        
        // Log progress messages with appropriate level
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
      }
    },
  });

  try {
    console.log(`Processing repository: ${repoUrl}`);
    console.log(`Output format: ${format}`);
    console.log('This may take a while for large repositories...');
    
    logger.info('Starting repository processing', { repoUrl, format });

    const output = await repoCombiner.processRepo(repoUrl);

    // Show summary information including line count
    console.log('\n=== Summary ===');
    console.log(`- Total files processed: ${repoCombiner.stats.totalFiles}`);
    console.log(`- Total size: ${(repoCombiner.stats.totalSize / 1024 / 1024).toFixed(2)} MB`);

    // Calculate total lines
    const totalLines = repoCombiner.files.reduce((sum, file) => sum + (file.lines || 0), 0);
    console.log(`- Total lines: ${totalLines.toLocaleString()}`);

    // Display token count and add an assessment
    const tokenCount = repoCombiner.stats.totalTokens;
    console.log(`- Total tokens: ${tokenCount.toLocaleString()}`);
    
    // Add token assessment
    let tokenAssessment = '';
    if (tokenCount < 1000) {
      tokenAssessment = 'Very small document, will fit easily in any chat window.';
    } else if (tokenCount < 4000) {
      tokenAssessment = 'Small document, should fit in most chat windows without issues.';
    } else if (tokenCount < 8000) {
      tokenAssessment = 'Medium size document, may approach limits of some basic chat interfaces.';
    } else if (tokenCount < 16000) {
      tokenAssessment = 'Large document, likely exceeds capacity of basic chat interfaces.';
    } else {
      tokenAssessment = 'Very large document, exceeds capacity of most chat interfaces.';
    }
    console.log(`- Token assessment: ${tokenAssessment}`);
    
    console.log(`- Processing time: ${(repoCombiner.stats.elapsedTime / 1000).toFixed(2)} seconds`);
    
    // Log summary to logger
    logger.info('Repository processing completed successfully', {
      repoUrl,
      format,
      stats: {
        totalFiles: repoCombiner.stats.totalFiles,
        totalSize: repoCombiner.stats.totalSize,
        totalLines,
        totalTokens: tokenCount,
        tokenAssessment,
        processingTime: `${(repoCombiner.stats.elapsedTime / 1000).toFixed(2)} seconds`
      }
    });

    // Always write output to file
    if (argv.output) {
      // Check if the output path is absolute, if not make it relative to project root
      let outputPath = argv.output;
      logger.debug(`Original output path: ${outputPath}`);
      
      if (!path.isAbsolute(outputPath)) {
        outputPath = path.join(projectRoot, outputPath);
        logger.debug(`Resolved relative path to: ${outputPath}`);
      }

      // Normalize path separators for cross-platform compatibility
      outputPath = path.normalize(outputPath);
      logger.debug(`Normalized output path: ${outputPath}`);

      // Suggest appropriate file extension if missing
      const hasExtension = path.extname(outputPath) !== '';
      logger.debug(`Output path has extension: ${hasExtension}`);

      if (!hasExtension) {
        const extensions = { text: '.txt', markdown: '.md', json: '.json' };
        outputPath = `${outputPath}${extensions[format] || ''}`;
        logger.info(`Added file extension to output path: ${path.extname(outputPath)}`);
        console.log(`No extension specified, using ${outputPath}`);
      }

      // Add datetime to the filename
      const originalPath = outputPath;
      outputPath = addDateTimeToFilename(outputPath);
      logger.debug(`Added datetime to filename: ${originalPath} -> ${outputPath}`);
      console.log(`Adding datetime to filename: ${outputPath}`);

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      logger.debug(`Ensuring output directory exists: ${outputDir}`);
      try {
        await fs.mkdir(outputDir, { recursive: true });
        logger.debug(`Output directory verified: ${outputDir}`);
      } catch (err) {
        if (err.code !== 'EEXIST') {
          logger.error(`Failed to create output directory: ${outputDir}`, {
            error: err.message,
            code: err.code
          });
          throw err;
        }
      }

      // Write the output to file
      logger.info(`Writing output to file: ${outputPath}`);
      try {
        await fs.writeFile(
          outputPath,
          typeof output === 'string' ? output : JSON.stringify(output, null, 2)
        );
        logger.info(`Successfully wrote output to: ${outputPath}`, {
          size: typeof output === 'string' ? output.length : JSON.stringify(output).length
        });
        console.log(`Output written to ${outputPath}`);
      } catch (err) {
        logger.error(`Failed to write output file: ${err.message}`, {
          path: outputPath,
          error: err.message,
          code: err.code
        });
        throw err;
      }
    } else {
      // Print output to console
      logger.info('No output file specified, printing to console');
      console.log(typeof output === 'string' ? output : JSON.stringify(output, null, 2));
    }
  } catch (error) {
    // Log the error with details
    logger.error(`Error processing repository: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      repoUrl,
      format
    });
    
    console.error('Error processing repository:');
    console.error(error.message);
    
    // Provide more helpful error messages based on error type
    if (error.message.includes('API rate limit')) {
      const tip = 'GitHub API rate limit exceeded. Try authenticating with a token.';
      logger.warn(tip);
      console.error('\nTip: GitHub API rate limit exceeded. Try authenticating with a token:');
      console.error(
        '  repo-combiner --token YOUR_GITHUB_TOKEN https://github.com/username/repository'
      );
    } else if (error.message.includes('authentication')) {
      const tip = 'Authentication required for private repositories.';
      logger.warn(tip);
      console.error('\nTip: For private repositories, you need to provide authentication:');
      console.error(
        '  repo-combiner --token YOUR_GITHUB_TOKEN https://github.com/username/repository'
      );
    } else if (error.message.includes('404')) {
      const tip = 'Repository not found. Check URL and existence.';
      logger.warn(tip);
      console.error(
        '\nTip: Repository not found. Check that the URL is correct and the repository exists.'
      );
    }
    
    logger.info('CLI execution terminated with error');
    process.exit(1);
  }
}

// Execute the CLI function
cli().catch(error => {
  logger.error('Unhandled error in CLI execution', {
    error: error.message,
    stack: error.stack
  });
  console.error('Unhandled error:', error);
  process.exit(1);
});
