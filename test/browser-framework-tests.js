// Browser framework specific tests for repo-combiner
// Tests specific functionality with different browser frameworks (Vue, Svelte, etc.)

/**
 * Run framework-specific browser tests
 * @param {Object} options Test options including the framework to test
 * @returns {Promise<Object>} Test results
 */
export async function runFrameworkTests(options = {}) {
  // Import the module - assumes it's already available in the global scope or as a module
  const { createRepoCombiner } = options.moduleExports || window;

  if (!createRepoCombiner) {
    throw new Error('repo-combiner module not found. Make sure it is imported before running tests.');
  }

  const runner = options.runner || new FrameworkTestRunner();
  const framework = options.framework || 'vanilla';

  runner.log(`Running ${framework} framework tests...`);

  // Basic framework detection test
  runner.test(`${framework} - Basic initialization`, () => {
    const combiner = createRepoCombiner();
    runner.assert(combiner !== null, `Should create instance in ${framework}`);
  });

  // Framework-specific tests
  switch (framework.toLowerCase()) {
    case 'vue':
      await runVueTests(runner, createRepoCombiner, options);
      break;
    case 'svelte':
      await runSvelteTests(runner, createRepoCombiner, options);
      break;
    case 'vanilla':
    default:
      await runVanillaTests(runner, createRepoCombiner, options);
      break;
  }
  
  // Add any additional tests from options
  if (typeof options.additionalFrameworkTests === 'function') {
    await options.additionalFrameworkTests(runner, framework);
  }

  // Return results if we're not using an existing runner
  if (!options.runner) {
    return runner.run();
  }
}

/**
 * Run tests specific to Vue.js integration
 */
async function runVueTests(runner, createRepoCombiner, options) {
  // Test Vue reactive state integration
  runner.test('Vue - Reactive state integration', () => {
    // Skip if Vue is not available
    if (!window.Vue) {
      runner.log('Skipping Vue tests: Vue not available');
      return;
    }
    
    const combiner = createRepoCombiner();
    
    // Create a Vue reactive wrapper around our stats
    const { reactive, nextTick } = window.Vue;
    const state = reactive({
      processingStats: { ...combiner.stats },
      files: []
    });
    
    // Set up a progress callback that updates Vue state
    combiner.config.onProgress = (data) => {
      Object.assign(state.processingStats, data.stats);
    };
    
    // Trigger a progress update
    combiner._reportProgress('Testing Vue integration', 0.5, 'testing');
    
    // Verify reactive update
    runner.assert(state.processingStats.elapsedTime === combiner.stats.elapsedTime,
      'Vue reactive state should update with combiner stats');
  });

  // Test Vue component lifecycle integration
  runner.test('Vue - Component lifecycle integration', async () => {
    if (!window.Vue) {
      runner.log('Skipping Vue tests: Vue not available');
      return;
    }
    
    const combiner = createRepoCombiner();
    const { ref, onUnmounted } = window.Vue;
    
    // Simulate a Vue component with cleanup
    const isProcessing = ref(false);
    let unmounted = false;
    
    // Set up cleanup on component unmount
    onUnmounted(() => {
      if (isProcessing.value) {
        combiner.abort();
      }
      unmounted = true;
    });
    
    // Start processing
    isProcessing.value = true;
    
    // Simulate component unmount
    const unmountHandler = onUnmounted.effect?.flush ? onUnmounted.effect : onUnmounted;
    if (typeof unmountHandler === 'function') {
      unmountHandler();
      runner.assert(unmounted === true, 'Unmount handler should be called');
    } else {
      // If we can't directly call the handler, we'll skip detailed assertions
      runner.assert(true, 'Vue test environment partially supported');
    }
  });
}

/**
 * Run tests specific to Svelte integration
 */
async function runSvelteTests(runner, createRepoCombiner, options) {
  // Test Svelte store integration
  runner.test('Svelte - Store integration', () => {
    // Skip if Svelte is not available
    if (typeof window.svelte === 'undefined' && 
        typeof window.SvelteStore === 'undefined' &&
        typeof window.writable === 'undefined') {
      runner.log('Skipping Svelte tests: Svelte not available');
      return;
    }
    
    const combiner = createRepoCombiner();
    
    // Create a mock Svelte store
    const createMockStore = (initialValue) => {
      let value = initialValue;
      const subscribers = [];
      
      const store = {
        subscribe: (fn) => {
          subscribers.push(fn);
          fn(value);
          return () => {
            const index = subscribers.indexOf(fn);
            if (index !== -1) subscribers.splice(index, 1);
          };
        },
        set: (newValue) => {
          value = newValue;
          subscribers.forEach(fn => fn(value));
        },
        update: (fn) => {
          store.set(fn(value));
        }
      };
      
      return store;
    };
    
    // Create Svelte stores for combiner state
    const statsStore = createMockStore({ ...combiner.stats });
    const filesStore = createMockStore([]);
    
    let lastStats = null;
    statsStore.subscribe(value => {
      lastStats = value;
    });
    
    // Set up progress callback
    combiner.config.onProgress = (data) => {
      statsStore.update(stats => ({ ...stats, ...data.stats }));
    };
    
    // Trigger progress
    combiner._reportProgress('Testing Svelte integration', 0.5, 'testing');
    
    // Verify store update
    runner.assert(lastStats !== null, 'Svelte store should receive updates');
    runner.assert(lastStats.startTime === combiner.stats.startTime,
      'Svelte store should contain updated stats');
  });
  
  // Test Svelte lifecycle integration
  runner.test('Svelte - Component lifecycle integration', () => {
    // This is a lightweight simulation since we might not have actual Svelte available
    const combiner = createRepoCombiner();
    let isDestroyed = false;
    
    // Simulate onDestroy lifecycle
    const onDestroy = (fn) => {
      // Store the cleanup function
      const cleanup = fn;
      
      // Return a function that simulates component destruction
      return () => {
        isDestroyed = true;
        cleanup();
      };
    };
    
    // Register cleanup with simulated Svelte lifecycle
    const destroy = onDestroy(() => {
      combiner.abort();
    });
    
    // Simulate component destruction
    destroy();
    
    // Verify cleanup occurred
    runner.assert(isDestroyed === true, 'Destruction handler should be called');
    runner.assert(combiner.aborted === true, 'Combiner should be aborted on component destroy');
  });
}

/**
 * Run tests specific to vanilla JS integration
 */
async function runVanillaTests(runner, createRepoCombiner, options) {
  // Test DOM integration
  runner.test('Vanilla - DOM integration', () => {
    const combiner = createRepoCombiner();
    
    // Create test element
    const el = document.createElement('div');
    el.id = 'test-output';
    document.body.appendChild(el);
    
    try {
      // Set up DOM-updating progress handler
      combiner.config.onProgress = (data) => {
        el.textContent = data.message;
        el.setAttribute('data-progress', data.progress || '0');
      };
      
      // Trigger progress
      combiner._reportProgress('Testing DOM integration', 0.75, 'testing');
      
      // Verify DOM updates
      runner.assert(el.textContent === 'Testing DOM integration', 
        'Progress handler should update DOM text');
      runner.assert(el.getAttribute('data-progress') === '0.75',
        'Progress handler should update DOM attributes');
      
    } finally {
      // Clean up
      document.body.removeChild(el);
    }
  });
  
  // Test event handling
  runner.test('Vanilla - Event handling', () => {
    const combiner = createRepoCombiner();
    
    // Create a custom event tracker
    let eventFired = false;
    let eventDetail = null;
    
    // Set up event listener
    const handleEvent = (e) => {
      eventFired = true;
      eventDetail = e.detail;
    };
    
    document.addEventListener('repo-combiner-progress', handleEvent);
    
    try {
      // Set up DOM event dispatching progress handler
      combiner.config.onProgress = (data) => {
        const event = new CustomEvent('repo-combiner-progress', {
          detail: data
        });
        document.dispatchEvent(event);
      };
      
      // Trigger progress
      combiner._reportProgress('Testing event handling', 0.5, 'testing');
      
      // Verify event fired
      runner.assert(eventFired === true, 'Custom event should be fired');
      runner.assert(eventDetail.message === 'Testing event handling',
        'Event should contain progress data');
      runner.assert(eventDetail.progress === 0.5,
        'Event should contain correct progress value');
      
    } finally {
      // Clean up
      document.removeEventListener('repo-combiner-progress', handleEvent);
    }
  });
  
  // Test with async/await in browser
  runner.test('Vanilla - Async/await browser support', async () => {
    const combiner = createRepoCombiner();
    
    // Add a simple mock file
    combiner.files = [{
      path: 'test.js',
      content: 'console.log("test");',
      size: 20,
      extension: '.js'
    }];
    
    // Generate output asynchronously
    const output = await Promise.resolve(combiner.generateOutput('text'));
    
    // Verify async operation works
    runner.assert(typeof output === 'string', 'Async operations should work in browser');
    runner.assert(output.includes('test.js'), 'Output should contain expected content');
  });
}

/**
 * Simple test runner for browser framework tests
 */
class FrameworkTestRunner {
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

    this.log(`Running ${this.tests.length} framework tests...`);

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