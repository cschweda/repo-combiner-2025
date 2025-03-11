#!/usr/bin/env node

/**
 * This script ensures that required output directories exist
 * Run during postinstall and can also be run manually
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Project root directory (compatible with ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Define the main async function
async function ensureDirectories() {
  // Directories that should exist
  const requiredDirs = [
    path.join(projectRoot, 'output'),
    path.join(projectRoot, 'bin', 'output')
  ];

  // Create each directory if it doesn't exist
  for (const dir of requiredDirs) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      console.log(`✅ Directory exists or was created: ${dir}`);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.warn(`⚠️ Warning: Could not create directory ${dir}: ${err.message}`);
      } else {
        console.log(`✅ Directory already exists: ${dir}`);
      }
    }
  }

  console.log('✅ All required directories are ready');
}

// Execute the function
ensureDirectories().catch(err => {
  console.error('❌ Error ensuring directories:', err);
  process.exit(1);
});