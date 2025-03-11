#!/usr/bin/env node

/**
 * This script ensures that the required directories exist.
 * It creates the output and test-output directories if they don't exist.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to project root directory
const projectRoot = path.join(__dirname, '..');

// Directories to ensure exist
const directories = [
  path.join(projectRoot, 'output'),
  path.join(projectRoot, 'test-output'),
  path.join(projectRoot, 'bin', 'output')
];

// Create each directory if it doesn't exist
for (const dir of directories) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } else {
      console.log(`Directory already exists: ${dir}`);
    }
  } catch (error) {
    console.error(`Error creating directory ${dir}:`, error);
  }
}

console.log('Directory check complete.');
