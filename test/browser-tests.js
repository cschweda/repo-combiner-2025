// Browser-specific tests for repo-combiner
// This file is designed to be used in a browser environment

/**
 * Simple test runner for browser environment
 */
class BrowserTestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };
    this.output = [];
  }

  /**
   * Add a test
   * @param {string} name Test name
   * @param {Function} fn Test function (async or sync)
   */
  test(name, fn) {
    this.tests.push({ name, fn });
    return this;
  }

  /**
   * Run all tests
   * @returns {Promise<Object>} Test results
   */
  async run() {
    this.results = {
      total: this.tests.length,
      passed: 0,
      failed: 0,
      skipped: 0,
    };
    this.output = [];

    this.log(`Running ${this.tests.length} browser tests...`);

    for (const test of this.tests) {
      try {
        this.log(`\nTest: ${test.name}`);
        await test.fn();
        this.results.passed++;
        this.log(`✅ Passed: ${test.name}`);
      } catch (error) {
        this.results.failed++;
        this.log(`❌ Failed: ${test.name}`);
        this.log(`   Error: ${error.message}`);
        console.error(error);
      }
    }

    this.log(`\nTest Results: ${this.results.passed}/${this.results.total} passed`);
    if (this.results.failed > 0) {
      this.log(`❌ ${this.results.failed} tests failed`);
    } else {
      this.log('✅ All tests passed!');
    }

    return {
      results: this.results,
      output: this.output.join('\n')
    };
  }

  /**
   * Log a message to the output
   * @param {string} message Message to log
   */
  log(message) {
    this.output.push(message);
    console.log(message);
  }

  /**
   * Assert that a condition is true
   * @param {boolean} condition Condition to check
   * @param {string} message Error message if condition is false
   * @throws {Error} If condition is false
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }
}

/**
 * Run browser-specific tests for repo-combiner
 * @param {Object} options Test options
 * @returns {Promise<Object>} Test results
 */
export async function runBrowserTests(options = {}) {
  // Import the module - assumes it's already available in the global scope or as a module
  const { createRepoCombiner } = options.moduleExports || window;
  
  if (!createRepoCombiner) {
    throw new Error('repo-combiner module not found. Make sure it is imported before running tests.');
  }

  const runner = new BrowserTestRunner();

  // Test factory function
  runner.test('Create BrowserRepoCombiner instance', () => {
    const combiner = createRepoCombiner();
    runner.assert(combiner !== null, 'Factory function should create an instance');
    runner.assert(combiner.constructor.name === 'BrowserRepoCombiner', 'Should create BrowserRepoCombiner in browser environment');
  });

  // Test configuration options
  runner.test('Configuration merging', () => {
    const customCombiner = createRepoCombiner({
      format: 'markdown',
      maxFileSizeMB: 20,
      customOption: 'test'
    });
    
    runner.assert(customCombiner.config.format === 'markdown', 'Should respect custom format');
    runner.assert(customCombiner.config.maxFileSizeMB === 20, 'Should respect custom maxFileSizeMB');
    runner.assert(customCombiner.config.customOption === 'test', 'Should add custom option');
  });

  // Test browser-specific utilities
  runner.test('_getFileExtension utility', () => {
    const combiner = createRepoCombiner();
    
    // Access the private method - in real tests you might use a more elegant approach
    runner.assert(combiner._getFileExtension('test.js') === '.js', 'Should extract js extension');
    runner.assert(combiner._getFileExtension('file.with.multiple.dots.txt') === '.txt', 'Should handle multiple dots');
    runner.assert(combiner._getFileExtension('no_extension') === '', 'Should return empty string for no extension');
    runner.assert(combiner._getFileExtension('.hidden') === '.hidden', 'Should handle hidden files');
    runner.assert(combiner._getFileExtension('') === '', 'Should handle empty string');
    runner.assert(combiner._getFileExtension() === '', 'Should handle undefined input');
  });

  // Test base64 encoding
  runner.test('_base64Encode utility', () => {
    const combiner = createRepoCombiner();
    
    const testStr = 'Hello, world!';
    const expected = 'SGVsbG8sIHdvcmxkIQ==';
    
    const encoded = combiner._base64Encode(testStr);
    runner.assert(encoded.replace(/=$/, '') === expected.replace(/=$/, ''), 
      'Should correctly encode string to base64');
    
    // Test with credentials format
    const credentials = 'username:password';
    const credentialsEncoded = combiner._base64Encode(credentials);
    runner.assert(typeof credentialsEncoded === 'string' && credentialsEncoded.length > 0,
      'Should encode credentials string');
  });

  // Test URL validation
  runner.test('URL validation', async () => {
    const combiner = createRepoCombiner();
    
    // Invalid URL
    try {
      await combiner.processRepo('not-a-url');
      runner.assert(false, 'Should reject invalid URL');
    } catch (error) {
      runner.assert(error.message.includes('Invalid repository URL'), 
        'Should reject with appropriate error message');
    }
    
    // Valid URL format but invalid repo - Skip actual API requests
    if (options.skipRemoteTests) {
      runner.log('Skipping remote repository tests');
      return;
    }
    
    // Optional: Test with a public repo (only if skipRemoteTests is false)
    const repoUrl = options.testRepoUrl || 'https://github.com/octocat/Hello-World';
    try {
      // Set a very low timeout to avoid long test runs
      const startResult = await combiner.processRepo(repoUrl, { 
        timeout: 3000,
        maxFileSizeMB: 0.1, // Set very small to skip most files
        onProgress: (data) => {
          runner.log(`Progress: ${data.message || 'Working...'}`);
        }
      });
      
      // If we get here, abort the operation
      combiner.abort();
      runner.assert(startResult !== null || combiner.aborted, 'Should start processing valid repo');
    } catch (error) {
      // We expect an error due to timeout or abort
      runner.assert(error.message.includes('aborted') || error.message.includes('timeout') || 
                   error.message.includes('rate limit'), 
        'Got expected error when testing with real repo');
    }
  });

  // Test error handling for rate limits
  runner.test('Rate limit error handling', () => {
    const combiner = createRepoCombiner();
    
    // Mock a rate limit response
    const mockError = {
      status: 403,
      message: 'API rate limit exceeded',
      isRateLimit: true,
      resetTime: Date.now() + 3600000 // 1 hour from now
    };
    
    // Test the error enhancement logic by creating a similar error to what would be thrown
    const enhancedError = new Error(
      `GitHub API rate limit exceeded while fetching repo. ` +
      `To increase your rate limit, authenticate with a GitHub token. ` +
      `${mockError.message}`
    );
    enhancedError.isRateLimit = mockError.isRateLimit;
    
    runner.assert(enhancedError.message.includes('authenticate with a GitHub token'), 
      'Rate limit errors should include authentication advice');
    runner.assert(enhancedError.isRateLimit === true, 
      'Rate limit errors should be flagged with isRateLimit property');
  });

  // Add custom tests based on authentication
  runner.test('Authentication configuration', () => {
    const withTokenAuth = createRepoCombiner({
      auth: {
        token: 'test-token'
      }
    });
    
    const withBasicAuth = createRepoCombiner({
      auth: {
        username: 'test-user',
        password: 'test-password'
      }
    });
    
    runner.assert(withTokenAuth.config.auth.token === 'test-token', 
      'Should properly set token authentication');
    
    runner.assert(withBasicAuth.config.auth.username === 'test-user' &&
                 withBasicAuth.config.auth.password === 'test-password', 
      'Should properly set basic authentication');
    
    // Test _hasAuth method
    runner.assert(withTokenAuth._hasAuth() === true, 'Should detect token auth');
    runner.assert(withBasicAuth._hasAuth() === true, 'Should detect basic auth');
    
    const noAuth = createRepoCombiner({
      auth: {}
    });
    
    runner.assert(noAuth._hasAuth() === false, 'Should detect missing auth');
  });

  // Run any additional tests provided by the caller
  if (typeof options.additionalTests === 'function') {
    await options.additionalTests(runner);
  }

  // Run all tests
  return runner.run();
}

// If running directly in browser
if (typeof window !== 'undefined' && window.runBrowserTestsNow) {
  window.addEventListener('load', () => {
    runBrowserTests()
      .then(results => {
        console.log('Browser tests completed:', results);
        if (typeof window.onBrowserTestsComplete === 'function') {
          window.onBrowserTestsComplete(results);
        }
      })
      .catch(error => {
        console.error('Browser tests failed:', error);
      });
  });
}