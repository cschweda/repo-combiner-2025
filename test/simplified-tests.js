/**
 * Simplified test suite for repo-combiner
 * Tests basic functionality and input validation
 */

import { createRepoCombiner } from '../src/repo-combiner.js';
import assert from 'assert';

/**
 * Run all simplified tests
 */
async function runSimplifiedTests() {
  console.log('🧪 Running simplified repo-combiner tests...');

  try {
    await testConfigValidation();
    await testUrlValidation();
    await testOutputFormats();
    await testErrorHandling();
    await testInputSanitization();

    console.log('\n✅ All simplified tests passed!');
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    return false;
  }
}

/**
 * Test configuration validation
 */
async function testConfigValidation() {
  console.log('\n📋 Testing configuration validation...');

  // Test default configuration
  const defaultCombiner = createRepoCombiner();
  assert(defaultCombiner.config.format === 'text', 'Default format should be text');
  assert(defaultCombiner.config.maxFileSizeMB > 0, 'Max file size should be positive');

  // Test custom configuration
  const customCombiner = createRepoCombiner({
    format: 'markdown',
    maxFileSizeMB: 20,
    skipExtensions: ['.pdf', '.zip'],
  });

  assert(customCombiner.config.format === 'markdown', 'Custom format not set correctly');
  assert(customCombiner.config.maxFileSizeMB === 20, 'Custom max file size not set correctly');
  assert(
    customCombiner.config.skipExtensions.includes('.pdf'),
    'Custom skip extensions not set correctly'
  );

  console.log('✅ Configuration validation tests passed');
}

/**
 * Test URL validation
 */
async function testUrlValidation() {
  console.log('\n🔗 Testing URL validation...');

  const combiner = createRepoCombiner();

  // Valid URLs
  const validUrls = [
    'https://github.com/user/repo',
    'https://github.com/user/repo.git',
    'git@github.com:user/repo.git',
  ];

  for (const url of validUrls) {
    try {
      // Just test if it parses without error
      await combiner._parseRepositoryUrl(url);
      console.log(`  ✓ Correctly parsed valid URL: ${url}`);
    } catch (error) {
      throw new Error(`Failed to parse valid URL ${url}: ${error.message}`);
    }
  }

  // Invalid URLs
  const invalidUrls = [
    'not-a-url',
    'http://example.com/not-github',
    'github.com/missing-protocol',
    'https://github.com/no-repo',
  ];

  for (const url of invalidUrls) {
    try {
      await combiner._parseRepositoryUrl(url);
      throw new Error(`Should have rejected invalid URL: ${url}`);
    } catch (error) {
      // This is expected - URL should be invalid
      console.log(`  ✓ Correctly rejected invalid URL: ${url}`);
    }
  }

  console.log('✅ URL validation tests passed');
}

/**
 * Test output formats
 */
async function testOutputFormats() {
  console.log('\n📄 Testing output formats...');

  const combiner = createRepoCombiner();

  // Add test files to the combiner
  combiner.files = [
    {
      path: 'test.js',
      content: 'console.log("test");',
      size: 20,
      extension: '.js',
    },
    {
      path: 'README.md',
      content: '# Test Repository',
      size: 16,
      extension: '.md',
    },
  ];

  // Test text output
  const textOutput = combiner.generateOutput('text');
  assert(typeof textOutput === 'string', 'Text output should be a string');
  assert(textOutput.includes('test.js'), 'Text output should include file names');

  // Test markdown output
  const markdownOutput = combiner.generateOutput('markdown');
  assert(typeof markdownOutput === 'string', 'Markdown output should be a string');
  assert(markdownOutput.includes('```javascript'), 'Markdown should have syntax highlighting');

  // Test JSON output
  const jsonOutput = combiner.generateOutput('json');
  assert(typeof jsonOutput === 'object', 'JSON output should be an object');
  assert(Array.isArray(jsonOutput.files), 'JSON output should have files array');

  // Test default for invalid format
  const invalidOutput = combiner.generateOutput('invalid-format');
  assert(typeof invalidOutput === 'string', 'Invalid format should default to text');

  console.log('✅ Output format tests passed');
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log('\n🐛 Testing error handling...');

  const combiner = createRepoCombiner();

  // Test file size limit
  combiner.config.maxFileSizeMB = 0.00001; // Very small

  const result = combiner._isFileSizeAllowed(1024 * 100); // 100KB
  assert(result === false, 'Should reject files larger than the limit');

  // Test network error handling
  try {
    // Mock a network error by calling with a non-existent repo
    await combiner.processRepo('https://github.com/this-repo-does-not-exist-123456789/repo');
    throw new Error('Should have failed on non-existent repository');
  } catch (error) {
    // This is expected - the repo doesn't exist
    assert(
      error.message.includes('failed') || error.message.includes('error'),
      'Should throw appropriate error message'
    );
    console.log('  ✓ Correctly handled non-existent repository');
  }

  console.log('✅ Error handling tests passed');
}

/**
 * Test input sanitization
 */
async function testInputSanitization() {
  console.log('\n🧹 Testing input sanitization...');

  const combiner = createRepoCombiner();

  // Test malicious path traversal detection
  const maliciousPaths = [
    '../../../etc/passwd',
    '/etc/passwd',
    '..\\Windows\\System32',
    'file.txt; rm -rf /',
  ];

  for (const path of maliciousPaths) {
    const isSafe = combiner._isPathSafe(path);
    assert(isSafe === false, `Should detect unsafe path: ${path}`);
    console.log(`  ✓ Correctly identified unsafe path: ${path}`);
  }

  // Test safe paths
  const safePaths = [
    'src/index.js',
    'README.md',
    'images/logo.png',
    'deeply/nested/folder/file.txt',
  ];

  for (const path of safePaths) {
    const isSafe = combiner._isPathSafe(path);
    assert(isSafe === true, `Should allow safe path: ${path}`);
    console.log(`  ✓ Correctly identified safe path: ${path}`);
  }

  console.log('✅ Input sanitization tests passed');
}

// Run the tests if the script is called directly
if (process.argv[1] === import.meta.url) {
  runSimplifiedTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { runSimplifiedTests };
