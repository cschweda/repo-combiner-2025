#!/usr/bin/env node

/**
 * This script updates the CHANGELOG.md file with commits since the last tag.
 * It reads the current CHANGELOG.md file, gets the commit messages since the last tag,
 * and inserts them into the Unreleased section.
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to CHANGELOG.md
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

// Get the last tag
let lastTag;
try {
  lastTag = execSync('git describe --tags --abbrev=0').toString().trim();
  console.log(`Last tag found: ${lastTag}`);
} catch (error) {
  console.log('No tags found. Using all commits.');
  lastTag = '';
}

// Get commit messages since last tag
const gitLogCommand = lastTag
  ? `git log ${lastTag}..HEAD --pretty=format:"- %s"`
  : 'git log --pretty=format:"- %s"';

const commitMessages = execSync(gitLogCommand).toString().trim().split('\n');

if (commitMessages.length === 0 || (commitMessages.length === 1 && commitMessages[0] === '')) {
  console.log('No new commits since last tag.');
  process.exit(0);
}

console.log(`Found ${commitMessages.length} commits to add to changelog.`);

// Read the current changelog
const changelog = fs.readFileSync(changelogPath, 'utf8');

// Simple categorization based on commit message prefixes
const categories = {
  added: [],
  changed: [],
  fixed: [],
  removed: [],
};

const categorizationRules = [
  { pattern: /^(feat|add):/i, category: 'added' },
  { pattern: /^(refactor|style|perf|change):/i, category: 'changed' },
  { pattern: /^(fix|bug):/i, category: 'fixed' },
  { pattern: /^(remove|delete):/i, category: 'removed' },
];

// Categorize each commit message
commitMessages.forEach(message => {
  if (!message) return;

  let categorized = false;
  for (const rule of categorizationRules) {
    if (rule.pattern.test(message)) {
      categories[rule.category].push(message.replace(rule.pattern, '').trim());
      categorized = true;
      break;
    }
  }

  // If not categorized, default to "changed"
  if (!categorized) {
    categories.changed.push(message);
  }
});

// Format for insertion
const formattedCommits = [];
if (categories.added.length) {
  formattedCommits.push('### Added', ...categories.added.map(msg => `- ${msg}`), '');
}
if (categories.changed.length) {
  formattedCommits.push('### Changed', ...categories.changed.map(msg => `- ${msg}`), '');
}
if (categories.fixed.length) {
  formattedCommits.push('### Fixed', ...categories.fixed.map(msg => `- ${msg}`), '');
}
if (categories.removed.length) {
  formattedCommits.push('### Removed', ...categories.removed.map(msg => `- ${msg}`), '');
}

// Split changelog at Unreleased section
const unreleasedMatch = changelog.match(/## \[Unreleased\]\n/);
if (!unreleasedMatch) {
  console.error('Could not find Unreleased section in CHANGELOG.md');
  process.exit(1);
}

const unreleasedIndex = unreleasedMatch.index + unreleasedMatch[0].length;
const beforeUnreleased = changelog.slice(0, unreleasedIndex);
const afterUnreleased = changelog.slice(unreleasedIndex);

// Find the end of the Unreleased section
const nextSectionMatch = afterUnreleased.match(/## \[\d+\.\d+\.\d+\]/);
const nextSectionIndex = nextSectionMatch ? nextSectionMatch.index : afterUnreleased.length;

// Insert new commits at the beginning of the Unreleased section
const updatedChangelog =
  beforeUnreleased + '\n' + formattedCommits.join('\n') + afterUnreleased.slice(nextSectionIndex);

// Write back to the file
fs.writeFileSync(changelogPath, updatedChangelog);

console.log('CHANGELOG.md updated successfully!');
console.log('Remember to review and edit the changelog as needed before committing.');
