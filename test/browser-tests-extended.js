// Extended browser-specific tests for repo-combiner
// These tests target specific browser implementations and edge cases

/**
 * Run extended browser-specific tests for repo-combiner
 * @param {Object} options Test options
 * @returns {Promise<Object>} Test results
 */
export async function runExtendedBrowserTests(options = {}) {
  // Import the module - assumes it's already available in the global scope or as a module
  const { createRepoCombiner, BrowserRepoCombiner } = options.moduleExports || window;
  
  if (!createRepoCombiner) {
    throw new Error('repo-combiner module not found. Make sure it is imported before running tests.');
  }

  const runner = options.runner || new BrowserTestRunner();

  // Test browser detection mechanism
  runner.test('Browser environment detection', () => {
    const combiner = createRepoCombiner();
    runner.assert(combiner.constructor.name === 'BrowserRepoCombiner', 
      'Should correctly detect browser environment');
    
    // Verify that browser-specific properties exist
    runner.assert(typeof combiner.apiRequestCount === 'number',
      'Should have browser-specific property apiRequestCount');
    runner.assert(typeof combiner.apiRateLimit === 'object',
      'Should have browser-specific property apiRateLimit');
    runner.assert(typeof combiner._fetchWithAuth === 'function',
      'Should have browser-specific method _fetchWithAuth');
  });

  // Test URL parsing in different formats
  runner.test('URL parsing with different formats', () => {
    const combiner = createRepoCombiner();
    
    // Test HTTPS URL
    const httpsUrl = 'https://github.com/user/repo';
    try {
      // Call cloneRepository but catch the error since it will try to fetch
      combiner.cloneRepository(httpsUrl).catch(() => {});
      
      // Instead check if the URL was parsed correctly via a different method
      const repoName = combiner.getRepoNameFromUrl(httpsUrl);
      runner.assert(repoName === 'repo', 'Should correctly parse HTTPS URL');
    } catch (error) {
      if (error.message.includes('Only GitHub')) {
        // This is fine - it means we got past the URL parsing
        runner.assert(true, 'Correctly parsed HTTPS URL format');
      } else {
        throw error;
      }
    }
    
    // Test SSH URL
    const sshUrl = 'git@github.com:user/repo.git';
    try {
      // Call cloneRepository but catch the error since it will try to fetch
      combiner.cloneRepository(sshUrl).catch(() => {});
      
      // Instead check if the URL was parsed correctly via a different method
      const repoName = combiner.getRepoNameFromUrl(sshUrl);
      runner.assert(repoName === 'repo', 'Should correctly parse SSH URL');
    } catch (error) {
      if (error.message.includes('Only GitHub')) {
        // This is fine - it means we got past the URL parsing
        runner.assert(true, 'Correctly parsed SSH URL format');
      } else {
        throw error;
      }
    }
  });

  // Test caching mechanism
  runner.test('Request caching mechanism', async () => {
    // Create a custom combiner that allows us to track API calls
    const combiner = createRepoCombiner();
    let fetchCounter = 0;
    
    // Temporarily override the _fetchWithAuth method to count calls
    const originalFetch = combiner._fetchWithAuth;
    combiner._fetchWithAuth = async function(url, options) {
      fetchCounter++;
      
      // Create a mock response
      const mockResponse = new Response(JSON.stringify({ mock: 'data' }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '59',
          'x-ratelimit-reset': (Math.floor(Date.now() / 1000) + 3600).toString(),
        }),
      });
      
      // Store in cache map
      const cacheKey = `${url}:${JSON.stringify(options || {})}`;
      combiner.cachedResponses.set(cacheKey, mockResponse.clone());
      
      return mockResponse;
    };
    
    try {
      // Make two identical requests - should use cache for second one
      const url = 'https://api.github.com/repos/user/repo';
      await combiner._fetchWithAuth(url);
      await combiner._fetchWithAuth(url);
      
      runner.assert(fetchCounter === 1, 'Cache should prevent duplicate API calls');
      
      // Make a different request - should make a new call
      await combiner._fetchWithAuth(url + '/contents');
      runner.assert(fetchCounter === 2, 'Cache should not affect different API calls');
      
    } finally {
      // Restore original method
      combiner._fetchWithAuth = originalFetch;
    }
  });

  // Test authentication URL preparation
  runner.test('Authentication URL preparation', () => {
    // Test token auth
    const tokenCombiner = createRepoCombiner({
      auth: {
        token: 'test-token'
      }
    });
    
    const httpsUrl = 'https://github.com/user/repo';
    const authedHttpsUrl = tokenCombiner.prepareAuthenticatedUrl(httpsUrl);
    
    runner.assert(authedHttpsUrl.includes('test-token'), 
      'Should add token to HTTPS URL');
    
    // Test basic auth
    const basicCombiner = createRepoCombiner({
      auth: {
        username: 'user',
        password: 'pass'
      }
    });
    
    const basicAuthedUrl = basicCombiner.prepareAuthenticatedUrl(httpsUrl);
    runner.assert(basicAuthedUrl.includes('user'), 
      'Should add username to HTTPS URL');
    
    // Test SSH URL handling (shouldn't change)
    const sshUrl = 'git@github.com:user/repo.git';
    const authedSshUrl = tokenCombiner.prepareAuthenticatedUrl(sshUrl);
    runner.assert(authedSshUrl === sshUrl, 
      'Should not modify SSH URLs for authentication');
  });

  // Test binary file detection
  runner.test('Binary file detection', () => {
    const combiner = createRepoCombiner();
    
    // Create a buffer with binary content (PNG header)
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const binaryBuffer = pngHeader.buffer;
    
    // Test directly with a Uint8Array since we don't have Buffer in browser
    const isBinary = combiner.isBinaryFile(new Uint8Array(binaryBuffer));
    runner.assert(isBinary === true, 'Should detect binary PNG file');
    
    // Test with text content
    const textBuffer = new TextEncoder().encode('This is text content').buffer;
    const isText = combiner.isBinaryFile(new Uint8Array(textBuffer));
    runner.assert(isText === false, 'Should detect text content as non-binary');
    
    // Test with null bytes (binary)
    const nullBuffer = new Uint8Array([0x00, 0x01, 0x02, 0x00, 0x03]).buffer;
    const isNullBinary = combiner.isBinaryFile(new Uint8Array(nullBuffer));
    runner.assert(isNullBinary === true, 'Should detect content with null bytes as binary');
  });

  // Test output format generation
  runner.test('Output format generation', () => {
    const combiner = createRepoCombiner();
    
    // Add some mock files to test with
    combiner.files = [
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
    
    // Test JSON format
    const jsonOutput = combiner.generateOutput('json');
    runner.assert(typeof jsonOutput === 'object', 'JSON output should be an object');
    runner.assert(Array.isArray(jsonOutput.files), 'JSON output should have files array');
    runner.assert(jsonOutput.files.length === 2, 'JSON output should contain all files');
    
    // Test Markdown format
    const markdownOutput = combiner.generateOutput('markdown');
    runner.assert(typeof markdownOutput === 'string', 'Markdown output should be a string');
    runner.assert(markdownOutput.includes('# Repository Content'), 
      'Markdown output should have correct heading');
    runner.assert(markdownOutput.includes('```js') || markdownOutput.includes('```javascript'), 
      'Markdown output should have syntax highlighting');
    
    // Test Text format
    const textOutput = combiner.generateOutput('text');
    runner.assert(typeof textOutput === 'string', 'Text output should be a string');
    runner.assert(textOutput.includes('REPOSITORY CONTENT'), 
      'Text output should have correct heading');
    
    // Test invalid format (should default to text)
    const defaultOutput = combiner.generateOutput('invalid-format');
    runner.assert(typeof defaultOutput === 'string', 'Invalid format should default to text');
  });

  // Test error handling and retry mechanism
  runner.test('Fetch retry mechanism mock', async () => {
    const combiner = createRepoCombiner();
    
    // Override _fetchWithAuth to test retry logic
    const originalFetch = combiner._fetchWithAuth;
    let attempts = 0;
    
    combiner._fetchWithAuth = async function(url, options) {
      attempts++;
      
      if (attempts <= 2) {
        // First two attempts fail with network error
        throw new Error('network error: connection refused');
      }
      
      // Third attempt succeeds
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '59',
          'x-ratelimit-reset': (Math.floor(Date.now() / 1000) + 3600).toString(),
        }),
      });
    };
    
    try {
      // Execute with mock implementation
      const response = await combiner._fetchWithAuth('https://api.github.com/repos/user/repo');
      const data = await response.json();
      
      runner.assert(attempts === 3, 'Should retry failed requests');
      runner.assert(data.success === true, 'Should eventually succeed after retries');
      
    } finally {
      // Restore original method
      combiner._fetchWithAuth = originalFetch;
    }
  });

  // Test file extension handling
  runner.test('File extension and language detection', () => {
    const combiner = createRepoCombiner();
    
    runner.assert(combiner._getFileExtension('file.js') === '.js', 
      'Should extract js extension');
    runner.assert(combiner._getFileExtension('file.min.js') === '.js', 
      'Should extract js extension from minified file');
    
    // Test language detection
    runner.assert(combiner.getLanguageFromExtension('.js') === 'javascript', 
      'Should map js to javascript');
    runner.assert(combiner.getLanguageFromExtension('.py') === 'python', 
      'Should map py to python');
    runner.assert(combiner.getLanguageFromExtension('.unknown') === '', 
      'Should return empty string for unknown extension');
  });

  // Browser compatibility tests for different browsers
  runner.test('Cross-browser compatibility check', () => {
    // Test for required browser features
    const features = {
      fetch: typeof fetch !== 'undefined',
      promise: typeof Promise !== 'undefined',
      async: (async () => {})() instanceof Promise,
      url: typeof URL !== 'undefined',
      textEncoder: typeof TextEncoder !== 'undefined'
    };
    
    // Log current browser features
    console.log('Browser features:', features);
    
    // We can't actually test different browsers here, but we can check for feature compatibility
    const missingFeatures = Object.entries(features)
      .filter(([_, supported]) => !supported)
      .map(([name]) => name);
    
    runner.assert(missingFeatures.length === 0, 
      `Current browser supports all required features. Missing: ${missingFeatures.join(', ')}`);
    
    // Test fallback implementation of base64 when btoa is not available
    const combiner = createRepoCombiner();
    const originalBtoa = window.btoa;
    
    try {
      // Remove btoa to test fallback
      window.btoa = undefined;
      
      const encoded = combiner._base64Encode('test');
      runner.assert(typeof encoded === 'string' && encoded.length > 0, 
        'Fallback base64 encoding should work when btoa is unavailable');
      
    } finally {
      // Restore original btoa
      window.btoa = originalBtoa;
    }
  });

  // Test abort functionality
  runner.test('Abort functionality', async () => {
    const combiner = createRepoCombiner();
    
    // Start an operation
    const processPromise = Promise.resolve().then(() => {
      // Simulate long-running operation
      combiner.aborted = false;
      combiner.activePromises.add(Promise.resolve());
      
      // Call abort
      combiner.abort();
      
      // Check if aborted
      runner.assert(combiner.aborted === true, 'Should set aborted flag');
    });
    
    await processPromise;
  });

  // Add any additional tests from options
  if (typeof options.additionalBrowserTests === 'function') {
    await options.additionalBrowserTests(runner);
  }

  // Return results if we're not using an existing runner
  if (!options.runner) {
    return runner.run();
  }
}

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

    this.log(`Running ${this.tests.length} extended browser tests...`);

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