#!/usr/bin/env node

/**
 * Automated release script for repo-combiner
 * Usage: 
 *   npm run release [patch|minor|major]
 *   npm run release:patch
 *   npm run release:minor
 *   npm run release:major
 * 
 * This script:
 * 1. Runs linting and tests to ensure code quality
 * 2. Updates the CHANGELOG.md file (running changelog:update)
 * 3. Bumps the version (patch, minor, or major)
 * 4. Pushes changes and tags to GitHub
 * 5. Publishes to npm
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// Project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Get version type from command line
const versionType = process.argv[2] || 'patch';

// Validate version type
if (!['patch', 'minor', 'major'].includes(versionType)) {
  console.error(`Invalid version type: ${versionType}`);
  console.error('Valid types are: patch, minor, major');
  process.exit(1);
}

/**
 * Execute shell command and return stdout
 */
function execCommand(command, options = {}) {
  try {
    const defaultOptions = { stdio: 'inherit', cwd: projectRoot };
    return execSync(command, { ...defaultOptions, ...options });
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Execute shell command and return stdout as string
 */
function execCommandWithOutput(command) {
  try {
    return execSync(command, { cwd: projectRoot }).toString().trim();
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Create readline interface for prompts
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for confirmation
 */
async function confirm(message) {
  const rl = createPrompt();
  
  return new Promise(resolve => {
    rl.question(`${message} (y/N) `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Main release function
 */
async function release() {
  try {
    // 1. Check for uncommitted changes
    const status = execCommandWithOutput('git status --porcelain');
    if (status) {
      console.error('You have uncommitted changes. Please commit or stash them first.');
      console.error(status);
      const shouldContinue = await confirm('Continue anyway?');
      if (!shouldContinue) {
        process.exit(1);
      }
    }

    // 2. Run linting and tests
    console.log('Running linting...');
    execCommand('npm run lint');
    
    console.log('Running tests...');
    execCommand('npm test');
    
    // 3. Update CHANGELOG
    console.log('Updating CHANGELOG...');
    execCommand('npm run changelog:update');
    
    // 4. Ask for confirmation
    const shouldContinue = await confirm(`Ready to release a ${versionType} version. Continue?`);
    if (!shouldContinue) {
      console.log('Release cancelled');
      process.exit(0);
    }
    
    // 5. Bump version
    console.log(`Bumping ${versionType} version...`);
    const newVersion = execCommandWithOutput(`npm version ${versionType} --no-git-tag-version`);
    console.log(`New version: ${newVersion}`);
    
    // 6. Commit version and changelog changes
    console.log('Committing changes...');
    execCommand('git add package.json package-lock.json CHANGELOG.md');
    execCommand(`git commit -m "chore: release ${newVersion}"`);
    
    // 7. Create tag
    console.log('Creating git tag...');
    execCommand(`git tag ${newVersion}`);
    
    // 8. Push changes and tags
    console.log('Pushing to GitHub...');
    execCommand('git push');
    execCommand('git push --tags');
    
    // 9. Check npm login status
    try {
      const whoami = execCommandWithOutput('npm whoami', { stdio: 'pipe' });
      console.log(`Logged in to npm as: ${whoami}`);
    } catch (error) {
      console.warn('You are not logged in to npm. Please run npm login first.');
      const shouldLogin = await confirm('Would you like to login to npm now?');
      if (shouldLogin) {
        execCommand('npm login');
      } else {
        console.log('Please run npm login and then npm publish manually.');
        process.exit(0);
      }
    }
    
    // 10. Publish to npm
    const shouldPublish = await confirm('Ready to publish to npm?');
    if (shouldPublish) {
      console.log('Publishing to npm...');
      execCommand('npm publish');
      console.log(`🎉 Successfully released and published ${newVersion}!`);
    } else {
      console.log('Publication cancelled. You can publish manually with:');
      console.log('  npm publish');
    }
    
  } catch (error) {
    console.error('Error during release process:');
    console.error(error);
    process.exit(1);
  }
}

// Execute release process
release().catch(error => {
  console.error('Unhandled error during release:', error);
  process.exit(1);
});