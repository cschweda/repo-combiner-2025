#!/usr/bin/env node

/**
 * Script to count lines in project files
 * This helps track code size for context window considerations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Configuration
const dirs = ['src', 'bin', 'example', 'test'];
const skipDirs = ['node_modules', '.git', 'dist', 'coverage', '.vscode'];
const skipExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.woff', '.ttf', '.eot'];

/**
 * Count lines in a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<{path: string, lines: number, size: number}>} File statistics
 */
async function countLinesInFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').length;
    const stats = await fs.stat(filePath);
    
    return {
      path: filePath,
      lines,
      size: stats.size
    };
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return {
      path: filePath,
      lines: 0,
      size: 0,
      error: err.message
    };
  }
}

/**
 * Walk directory recursively and process files
 * @param {string} dir - Directory to process
 * @param {Function} fileCallback - Callback for each file
 * @returns {Promise<void>}
 */
async function walkDirectory(dir, fileCallback) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip directories in the skipDirs list
        if (skipDirs.includes(entry.name)) continue;
        
        // Process subdirectory recursively
        await walkDirectory(fullPath, fileCallback);
      } else if (entry.isFile()) {
        // Skip files with extensions in skipExtensions
        const ext = path.extname(entry.name).toLowerCase();
        if (skipExtensions.includes(ext)) continue;
        
        // Process the file
        await fileCallback(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error processing directory ${dir}:`, err.message);
  }
}

/**
 * Main function
 */
async function main() {
  const fileStats = [];
  
  // Process each directory
  for (const dir of dirs) {
    const dirPath = path.join(projectRoot, dir);
    
    try {
      await fs.access(dirPath);
      console.log(`Processing directory: ${dir}`);
      
      await walkDirectory(dirPath, async (filePath) => {
        const stats = await countLinesInFile(filePath);
        fileStats.push(stats);
      });
    } catch (err) {
      console.warn(`Directory ${dir} not found, skipping.`);
    }
  }
  
  // Sort by line count (descending)
  fileStats.sort((a, b) => b.lines - a.lines);
  
  // Calculate totals
  const totalLines = fileStats.reduce((sum, file) => sum + file.lines, 0);
  const totalSize = fileStats.reduce((sum, file) => sum + file.size, 0);
  const totalFiles = fileStats.length;
  
  // Estimate tokens (rough approximation)
  const estimatedTokens = Math.round(totalSize / 4); // ~4 chars per token
  
  // Print report
  console.log('\n=== LINE COUNT REPORT ===');
  fileStats.forEach(file => {
    // Make the path relative to project root for cleaner output
    const relativePath = path.relative(projectRoot, file.path);
    console.log(`${relativePath}: ${file.lines.toLocaleString()} lines (${(file.size / 1024).toFixed(1)} KB)`);
  });
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total Files: ${totalFiles.toLocaleString()}`);
  console.log(`Total Lines: ${totalLines.toLocaleString()}`);
  console.log(`Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Estimated Tokens: ~${estimatedTokens.toLocaleString()}`);
  console.log(`Average Lines Per File: ${(totalLines / totalFiles).toFixed(1)}`);
  
  // Find the largest files
  console.log('\n=== TOP 5 LARGEST FILES (BY LINES) ===');
  fileStats.slice(0, 5).forEach(file => {
    const relativePath = path.relative(projectRoot, file.path);
    console.log(`${relativePath}: ${file.lines.toLocaleString()} lines (${(file.size / 1024).toFixed(1)} KB)`);
  });
  
  // Generate markdown-formatted output
  const markdownOutput = generateMarkdownReport(fileStats, totalLines, totalSize, totalFiles, estimatedTokens);
  await fs.writeFile(path.join(projectRoot, 'code-stats.md'), markdownOutput);
  console.log('\nMarkdown report saved to code-stats.md');
}

/**
 * Generate a markdown report
 * @param {Array} fileStats - File statistics
 * @param {number} totalLines - Total line count
 * @param {number} totalSize - Total file size
 * @param {number} totalFiles - Total file count
 * @param {number} estimatedTokens - Estimated token count
 * @returns {string} Markdown formatted report
 */
function generateMarkdownReport(fileStats, totalLines, totalSize, totalFiles, estimatedTokens) {
  let output = '# Code Statistics Report\n\n';
  
  output += '## Summary\n\n';
  output += `- **Total Files:** ${totalFiles.toLocaleString()}\n`;
  output += `- **Total Lines:** ${totalLines.toLocaleString()}\n`;
  output += `- **Total Size:** ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`;
  output += `- **Estimated Tokens:** ~${estimatedTokens.toLocaleString()}\n`;
  output += `- **Average Lines Per File:** ${(totalLines / totalFiles).toFixed(1)}\n\n`;
  
  output += '## Files by Line Count\n\n';
  output += '| File | Lines | Size |\n';
  output += '| ---- | ----: | ---: |\n';
  
  fileStats.forEach(file => {
    const relativePath = path.relative(projectRoot, file.path);
    output += `| ${relativePath} | ${file.lines.toLocaleString()} | ${(file.size / 1024).toFixed(1)} KB |\n`;
  });
  
  return output;
}

// Execute main function
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
