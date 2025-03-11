// Node.js-specific tests for repo-combiner
import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { createRepoCombiner } from '../src/repo-combiner.js';

// Get the RepoCombiner class by creating an instance in Node environment
const RepoCombiner = createRepoCombiner().constructor;

// Test utilities
function createTempDir() {
  const tempPath = path.join(os.tmpdir(), `repo-combiner-test-${Date.now()}`);
  execSync(`mkdir -p ${tempPath}`);
  return tempPath;
}

async function removeTempDir(dirPath) {
  if (!dirPath || !dirPath.includes('repo-combiner-test')) {
    throw new Error('Invalid temp directory');
  }
  
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Warning: Failed to clean up temp directory: ${error.message}`);
  }
}

/**
 * Run basic tests for the RepoCombiner in Node.js environment
 */
export async function runNodeTests() {
  console.log('\n==== Running Node.js tests for repo-combiner ====');
  let tempDir = null;
  
  try {
    // Create temporary directory for tests
    tempDir = createTempDir();
    console.log(`Created temp directory: ${tempDir}`);
    
    // Test instance creation
    const combiner = createRepoCombiner();
    assert(combiner instanceof RepoCombiner, 'Factory function should create a RepoCombiner instance in Node.js');
    
    // Test configuration merging
    const customCombiner = createRepoCombiner({
      format: 'markdown',
      maxFileSizeMB: 20,
      customOption: 'test',
      tempDir: tempDir
    });
    
    assert(customCombiner.config.format === 'markdown', 'Should respect custom format');
    assert(customCombiner.config.maxFileSizeMB === 20, 'Should respect custom maxFileSizeMB');
    assert(customCombiner.config.customOption === 'test', 'Should add custom option');
    assert(customCombiner.config.tempDir === tempDir, 'Should use provided temp directory');
    console.log('✅ Configuration test passed');
    
    // Test URL validation
    await testUrlValidation(combiner);
    
    // Test binary file detection
    await testBinaryFileDetection(combiner, tempDir);
    
    // Test file processing
    await testFileProcessing(combiner, tempDir);
    
    // Test output generation
    await testOutputGeneration(combiner);
    
    // Test output file saving
    await testOutputFileSaving(combiner, tempDir);
    
    // Test repository name extraction
    testRepoNameExtraction(combiner);
    
    // Test authentication URL handling
    testAuthenticationUrlHandling();
    
    // Test progress reporting
    testProgressReporting(combiner);
    
    console.log('\nAll Node.js tests completed successfully!');
  } finally {
    // Clean up
    if (tempDir) {
      await removeTempDir(tempDir);
      console.log(`Removed temp directory: ${tempDir}`);
    }
  }
}

/**
 * Test URL validation
 */
async function testUrlValidation(combiner) {
  console.log('\nTesting URL validation...');
  try {
    await combiner.processRepo('not-a-url');
    assert.fail('Should reject invalid URLs');
  } catch (error) {
    assert(error.message.includes('Invalid repository URL'), 'Should reject with appropriate error message');
  }
  
  try {
    await combiner.processRepo('http://example.com');
    assert.fail('Should reject non-repository URLs');
  } catch (error) {
    assert(error.message.includes('Invalid repository URL'), 'Should reject non-repository URLs');
  }
  
  try {
    await combiner.processRepo(null);
    assert.fail('Should reject null URL');
  } catch (error) {
    assert(error.message.includes('required'), 'Should reject null URL');
  }
  
  console.log('✅ URL validation test passed');
}

/**
 * Test binary file detection
 */
async function testBinaryFileDetection(combiner, tempDir) {
  console.log('\nTesting binary file detection...');
  
  // Create test files
  const textFilePath = path.join(tempDir, 'test.txt');
  const binaryFilePath = path.join(tempDir, 'test.bin');
  
  await fs.writeFile(textFilePath, 'This is a text file with UTF-8 encoding.');
  
  // Create a binary file with PNG header
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  await fs.writeFile(binaryFilePath, Buffer.concat([pngHeader, Buffer.from('Additional data')]));
  
  // Test text file detection
  const textFileHandle = await fs.open(textFilePath, 'r');
  const textBuffer = Buffer.alloc(1024);
  const { bytesRead: textBytesRead } = await textFileHandle.read(textBuffer, 0, textBuffer.length, 0);
  await textFileHandle.close();
  
  assert(combiner.isBinaryFile(textBuffer.slice(0, textBytesRead)) === false, 'Should detect text file as non-binary');
  
  // Test binary file detection
  const binaryFileHandle = await fs.open(binaryFilePath, 'r');
  const binaryBuffer = Buffer.alloc(1024);
  const { bytesRead: binaryBytesRead } = await binaryFileHandle.read(binaryBuffer, 0, binaryBuffer.length, 0);
  await binaryFileHandle.close();
  
  assert(combiner.isBinaryFile(binaryBuffer.slice(0, binaryBytesRead)) === true, 'Should detect binary file as binary');
  
  // Test null byte detection
  const nullBuffer = Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03]);
  assert(combiner.isBinaryFile(nullBuffer) === true, 'Should detect buffer with null bytes as binary');
  
  console.log('✅ Binary file detection test passed');
}

/**
 * Test file processing
 */
async function testFileProcessing(combiner, tempDir) {
  console.log('\nTesting file processing...');
  
  // Create a test directory structure
  const testRepoDir = path.join(tempDir, 'test-repo');
  const srcDir = path.join(testRepoDir, 'src');
  const docsDir = path.join(testRepoDir, 'docs');
  
  await fs.mkdir(testRepoDir, { recursive: true });
  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(docsDir, { recursive: true });
  
  // Create test files
  await fs.writeFile(path.join(testRepoDir, 'README.md'), '# Test Repository\n\nThis is a test repository.');
  await fs.writeFile(path.join(srcDir, 'index.js'), 'console.log("Hello World");');
  await fs.writeFile(path.join(docsDir, 'guide.md'), '# User Guide\n\nThis is a user guide.');
  
  // Configure a test repo combiner
  const testCombiner = createRepoCombiner({
    skipDirs: ['node_modules', '.git'],
    skipFiles: ['.DS_Store'],
    keepTemp: true
  });
  
  // Process the directory
  await testCombiner.processDirectory(testRepoDir, testCombiner.config);
  
  // Verify the processed files
  assert(testCombiner.files.length === 3, `Should process 3 files, got ${testCombiner.files.length}`);
  
  // Check if all files are included with correct paths
  const filePaths = testCombiner.files.map(file => file.path);
  assert(filePaths.includes('README.md'), 'Should include README.md');
  assert(filePaths.includes(path.join('src', 'index.js')), 'Should include src/index.js');
  assert(filePaths.includes(path.join('docs', 'guide.md')), 'Should include docs/guide.md');
  
  console.log('✅ File processing test passed');
}

/**
 * Test output generation
 */
async function testOutputGeneration(combiner) {
  console.log('\nTesting output generation...');
  
  // Create a test combiner with sample files
  const testCombiner = createRepoCombiner();
  
  // Add some mock files to test with
  testCombiner.files = [
    {
      path: 'README.md',
      content: '# Test Repository\nThis is a test.',
      size: 30,
      extension: '.md',
      lastModified: new Date()
    },
    {
      path: 'src/index.js',
      content: 'console.log("Hello World");',
      size: 28,
      extension: '.js',
      lastModified: new Date()
    }
  ];
  
  // Test JSON output
  const jsonOutput = testCombiner.generateOutput('json');
  assert(typeof jsonOutput === 'object', 'JSON output should be an object');
  assert(Array.isArray(jsonOutput.files), 'JSON output should have files array');
  assert(jsonOutput.files.length === 2, 'JSON output should contain all files');
  
  // Test Markdown output
  const markdownOutput = testCombiner.generateOutput('markdown');
  assert(typeof markdownOutput === 'string', 'Markdown output should be a string');
  assert(markdownOutput.includes('# Repository Content'), 'Markdown output should have correct heading');
  assert(markdownOutput.includes('```js') || markdownOutput.includes('```javascript'), 
    'Markdown output should have syntax highlighting');
  
  // Test Text output
  const textOutput = testCombiner.generateOutput('text');
  assert(typeof textOutput === 'string', 'Text output should be a string');
  assert(textOutput.includes('REPOSITORY CONTENT'), 'Text output should have correct heading');
  
  // Test default to text for invalid format
  const defaultOutput = testCombiner.generateOutput('invalid-format');
  assert(typeof defaultOutput === 'string', 'Invalid format should default to text');
  
  console.log('✅ Output generation test passed');
}

/**
 * Test output file saving
 */
async function testOutputFileSaving(combiner, tempDir) {
  console.log('\nTesting output file saving...');
  
  const outputPath = path.join(tempDir, 'output.txt');
  const textContent = 'Test output content';
  
  // Save text output
  const savedPath = await combiner.saveToFile(textContent, outputPath);
  
  // Verify the file exists and has correct content
  assert(savedPath && savedPath.includes('output'), 'Should return valid output path');
  
  const fileContent = await fs.readFile(savedPath, 'utf8');
  assert(fileContent === textContent, 'Saved file should have correct content');
  
  // Test saving JSON output
  const jsonOutputPath = path.join(tempDir, 'output.json');
  const jsonContent = { test: true, data: [1, 2, 3] };
  
  const savedJsonPath = await combiner.saveToFile(jsonContent, jsonOutputPath);
  
  // Verify the JSON file
  const jsonFileContent = await fs.readFile(savedJsonPath, 'utf8');
  const parsedJson = JSON.parse(jsonFileContent);
  assert(parsedJson.test === true, 'Saved JSON should have correct content');
  assert(Array.isArray(parsedJson.data), 'Saved JSON should maintain structure');
  
  console.log('✅ Output file saving test passed');
}

/**
 * Test repository name extraction
 */
function testRepoNameExtraction(combiner) {
  console.log('\nTesting repository name extraction...');
  
  // Test HTTPS URL
  const httpsUrl = 'https://github.com/user/repo';
  const httpsRepoName = combiner.getRepoNameFromUrl(httpsUrl);
  assert(httpsRepoName === 'repo', 'Should extract repo name from HTTPS URL');
  
  // Test HTTPS URL with .git suffix
  const httpsGitUrl = 'https://github.com/user/repo.git';
  const httpsGitRepoName = combiner.getRepoNameFromUrl(httpsGitUrl);
  assert(httpsGitRepoName === 'repo', 'Should extract repo name from HTTPS URL with .git suffix');
  
  // Test SSH URL
  const sshUrl = 'git@github.com:user/repo';
  const sshRepoName = combiner.getRepoNameFromUrl(sshUrl);
  assert(sshRepoName === 'repo', 'Should extract repo name from SSH URL');
  
  // Test SSH URL with .git suffix
  const sshGitUrl = 'git@github.com:user/repo.git';
  const sshGitRepoName = combiner.getRepoNameFromUrl(sshGitUrl);
  assert(sshGitRepoName === 'repo', 'Should extract repo name from SSH URL with .git suffix');
  
  // Test handling of invalid URL
  const invalidUrl = 'not-a-url';
  const fallbackRepoName = combiner.getRepoNameFromUrl(invalidUrl);
  assert(fallbackRepoName === 'not-a-url' || fallbackRepoName.startsWith('repo-'), 
    'Should handle invalid URLs gracefully');
  
  console.log('✅ Repository name extraction test passed');
}

/**
 * Test authentication URL handling
 */
function testAuthenticationUrlHandling() {
  console.log('\nTesting authentication URL handling...');
  
  // Create combiner with token authentication
  const tokenCombiner = createRepoCombiner({
    auth: {
      token: 'test-token'
    }
  });
  
  // Test HTTPS URL with token
  const httpsUrl = 'https://github.com/user/repo';
  const authedUrl = tokenCombiner.prepareAuthenticatedUrl(httpsUrl);
  
  assert(authedUrl.includes('test-token'), 'Should include token in authenticated URL');
  assert(authedUrl.includes('x-oauth-basic'), 'Should include oauth basic marker in URL');
  
  // Test SSH URL (should remain unchanged)
  const sshUrl = 'git@github.com:user/repo.git';
  const authedSshUrl = tokenCombiner.prepareAuthenticatedUrl(sshUrl);
  
  assert(authedSshUrl === sshUrl, 'SSH URL should remain unchanged');
  
  // Create combiner with username/password authentication
  const basicCombiner = createRepoCombiner({
    auth: {
      username: 'testuser',
      password: 'testpass'
    }
  });
  
  // Test HTTPS URL with basic auth
  const basicAuthedUrl = basicCombiner.prepareAuthenticatedUrl(httpsUrl);
  
  assert(basicAuthedUrl.includes('testuser'), 'Should include username in authenticated URL');
  assert(basicAuthedUrl.includes('testpass'), 'Should include password in authenticated URL');
  
  console.log('✅ Authentication URL handling test passed');
}

/**
 * Test progress reporting
 */
function testProgressReporting(combiner) {
  console.log('\nTesting progress reporting...');
  
  let progressEvents = [];
  
  // Create a combiner with progress callback
  const progressCombiner = createRepoCombiner({
    onProgress: (data) => {
      progressEvents.push(data);
    }
  });
  
  // Trigger some progress reports
  progressCombiner._reportProgress('Test message', 0.5, 'testing');
  progressCombiner._reportProgress('Another message', 0.75, 'testing');
  progressCombiner._reportProgress('Final message', 1.0, 'complete');
  
  // Verify progress events
  assert(progressEvents.length === 3, 'Should record 3 progress events');
  assert(progressEvents[0].message === 'Test message', 'Should record correct message');
  assert(progressEvents[0].progress === 0.5, 'Should record progress value');
  assert(progressEvents[0].phase === 'testing', 'Should record phase');
  assert(progressEvents[2].phase === 'complete', 'Should record complete phase');
  
  // Verify timestamp
  assert(typeof progressEvents[0].timestamp === 'string', 'Should include timestamp');
  
  // Verify stats object
  assert(typeof progressEvents[0].stats === 'object', 'Should include stats object');
  
  console.log('✅ Progress reporting test passed');
}

// Run the tests if this file is executed directly
if (process.argv[1] === import.meta.url) {
  runNodeTests().catch(error => {
    console.error('Tests failed:', error);
    process.exit(1);
  });
}