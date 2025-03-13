#!/usr/bin/env node

/**
 * Automated npm publication script for repo-combiner
 * Usage:
 *   npm run publish [patch|minor|major]
 *   npm run publish:patch
 *   npm run publish:minor
 *   npm run publish:major
 *
 * This script:
 * 1. Bumps the version (patch, minor, or major)
 * 2. Adds all changed files to git
 * 3. Commits and pushes to GitHub with the new version
 * 4. Performs npm login
 * 5. Publishes to npm
 */

import { execSync } from 'child_process';
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
 * Main publish function
 */
async function release() {
  try {
    // 1. Display current status
    console.log('Current git status:');
    execCommand('git status');

    // 2. Ask for confirmation
    const shouldContinue = await confirm(
      `Ready to publish a ${versionType} version update. Continue?`
    );
    if (!shouldContinue) {
      console.log('Publication cancelled');
      process.exit(0);
    }

    // 3. Bump version
    console.log(`\n🔼 Bumping ${versionType} version...`);
    const newVersion = execCommandWithOutput(`npm version ${versionType} --no-git-tag-version`);
    console.log(`New version: ${newVersion}`);

    // 4. Add all files to git
    console.log('\n📁 Adding all files to git...');
    execCommand('git add .');

    // 5. Commit version changes
    console.log('\n💾 Committing changes...');
    execCommand(`git commit -m 'chore: release ${newVersion}'`);

    // 6. Create tag
    console.log('\n🏷️ Creating git tag...');
    execCommand(`git tag ${newVersion}`);

    // 7. Push changes and tags
    console.log('\n⬆️ Pushing to GitHub...');
    execCommand('git push');
    execCommand('git push --tags');

    // 8. Always prompt for npm login
    console.log('\n🔑 Logging in to npm...');
    console.log('Please enter your npm credentials:');
    execCommand('npm login');

    // 9. Publish to npm
    console.log('\n🚀 Publishing to npm...');
    execCommand('npm publish');

    console.log(`\n🎉 Successfully released and published ${newVersion}!`);
    console.log('\nPackage is now available at: https://www.npmjs.com/package/repo-combiner');
  } catch (error) {
    console.error('\n❌ Error during publication process:');
    console.error(error);
    process.exit(1);
  }
}

// Execute release process
release().catch(error => {
  console.error('Unhandled error during release:', error);
  process.exit(1);
});
