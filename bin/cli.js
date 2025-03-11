#!/usr/bin/env node

import path from 'path';
import fs from 'fs/promises';
import minimist from 'minimist';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { createRepoCombiner } from '../src/repo-combiner.js';
import readline from 'readline';

// Make the module work in both ESM and CommonJS environments
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine project root directory (one level up from bin directory)
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables from .env file
dotenv.config();

// Check for authentication environment variables and print a warning if not found
if (!process.env.GITHUB_TOKEN && !(process.env.GITHUB_USERNAME && process.env.GITHUB_PASSWORD)) {
  console.warn('\n⚠️  Warning: No GitHub authentication found in environment variables.');
  console.warn('   For private repositories, create a .env file with GitHub credentials.');
  console.warn('   See .env.sample for more information.\n');
}

/**
 * Show CLI help
 */
function showHelp() {
  console.log(`
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
  `);
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
  const requiredDirs = [
    path.join(projectRoot, 'output'),
    path.join(projectRoot, 'bin', 'output')
  ];
  
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
  
  const argv = minimist(process.argv.slice(2), {
    string: ['format', 'output', 'token', 'username', 'password'],
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
    },
  });

  // Show help
  if (argv.help) {
    showHelp();
    return;
  }

  // Show version
  if (argv.version) {
    try {
      const packageJsonPath = path.resolve(__dirname, '../package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      console.log(`repo-combiner v${packageJson.version}`);
    } catch (error) {
      console.error('Error reading package.json:', error.message);
      console.log('repo-combiner v1.0.0');
    }
    return;
  }

  // Default repository URL for this project
  const defaultRepoUrl = 'https://github.com/cschweda/repo-combiner-2025';

  // Check for repository URL from arguments
  let repoUrl = argv._[0];

  // If no repository URL is provided via arguments, prompt the user
  if (!repoUrl) {
    repoUrl = await promptForRepository(defaultRepoUrl);
  }

  // Prompt for format if not specified in arguments and not in non-interactive mode
  let format = argv.format;
  if (format === 'text' && !argv.output && process.stdin.isTTY) {
    format = await promptForFormat('text');
  }

  // Validate format
  const validFormats = ['text', 'markdown', 'json'];
  if (!validFormats.includes(format)) {
    console.error(
      `Error: Invalid format '${format}'. Valid formats are: ${validFormats.join(', ')}`
    );
    return;
  }

  // Validate repository URL
  if (!repoUrl.match(/^(https?:\/\/|git@)([a-zA-Z0-9-]+\.)+[a-zA-Z0-9]{2,}(\/|:)[^\s]+\/[^\s]+$/)) {
    console.error('Error: Invalid repository URL format');
    console.error(
      'Expected format: https://github.com/username/repository or git@github.com:username/repository'
    );
    return;
  }

  // Process repository
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
      }
    },
  });

  try {
    console.log(`Processing repository: ${repoUrl}`);
    console.log(`Output format: ${format}`);
    console.log('This may take a while for large repositories...');

    const output = await repoCombiner.processRepo(repoUrl);

    // Always write output to file
    if (argv.output) {
      // Check if the output path is absolute, if not make it relative to project root
      let outputPath = argv.output;
      if (!path.isAbsolute(outputPath)) {
        outputPath = path.join(projectRoot, outputPath);
      }

      // Normalize path separators for cross-platform compatibility
      outputPath = path.normalize(outputPath);

      // Suggest appropriate file extension if missing
      const hasExtension = path.extname(outputPath) !== '';

      if (!hasExtension) {
        const extensions = { text: '.txt', markdown: '.md', json: '.json' };
        outputPath = `${outputPath}${extensions[format] || ''}`;
        console.log(`No extension specified, using ${outputPath}`);
      }

      // Add datetime to the filename
      outputPath = addDateTimeToFilename(outputPath);
      console.log(`Adding datetime to filename: ${outputPath}`);

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      try {
        await fs.mkdir(outputDir, { recursive: true });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }

      await fs.writeFile(
        outputPath,
        typeof output === 'string' ? output : JSON.stringify(output, null, 2)
      );
      console.log(`Output written to ${outputPath}`);
    } else {
      // Print output to console
      console.log(typeof output === 'string' ? output : JSON.stringify(output, null, 2));
    }
  } catch (error) {
    console.error('Error processing repository:');
    console.error(error.message);
    // Provide more helpful error messages based on error type
    if (error.message.includes('API rate limit')) {
      console.error('\nTip: GitHub API rate limit exceeded. Try authenticating with a token:');
      console.error(
        '  repo-combiner --token YOUR_GITHUB_TOKEN https://github.com/username/repository'
      );
    } else if (error.message.includes('authentication')) {
      console.error('\nTip: For private repositories, you need to provide authentication:');
      console.error(
        '  repo-combiner --token YOUR_GITHUB_TOKEN https://github.com/username/repository'
      );
    } else if (error.message.includes('404')) {
      console.error(
        '\nTip: Repository not found. Check that the URL is correct and the repository exists.'
      );
    }
    process.exit(1);
  }
}

// Execute the CLI function
cli().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
