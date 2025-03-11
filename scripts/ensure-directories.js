#!/usr/bin/env node

/**
 * Script to ensure that required directories exist
 * This helps prevent issues with missing output directories
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Directories to ensure exist
const requiredDirs = [path.join(projectRoot, 'output'), path.join(projectRoot, 'test', 'fixtures')];

async function ensureDirectoriesExist() {
  console.log('Ensuring required directories exist...');

  for (const dir of requiredDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`✓ Directory exists: ${path.relative(projectRoot, dir)}`);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error(`Error creating directory ${dir}:`, err.message);
      }
    }
  }

  console.log('Directory check complete.');
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureDirectoriesExist().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

export default ensureDirectoriesExist;
