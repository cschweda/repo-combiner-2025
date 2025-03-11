// Basic test file
import assert from 'assert';
import { createRepoCombiner } from '../src/repo-combiner.js';

// Mock tests - replace with actual test framework like Jest or Mocha
async function runTests() {
  console.log('Running repo-combiner tests...');
  
  // Test factory function
  const combiner = createRepoCombiner();
  assert(combiner !== null, 'Factory function should create an instance');
  
  // Test URL validation
  try {
    await combiner.processRepo('not-a-url');
    console.error('❌ URL validation test failed');
  } catch (error) {
    console.log('✅ URL validation test passed');
  }
  
  // Test configuration merging
  const customCombiner = createRepoCombiner({
    format: 'markdown',
    maxFileSizeMB: 20,
    customOption: 'test'
  });
  
  assert(customCombiner.config.format === 'markdown', 'Should respect custom format');
  assert(customCombiner.config.maxFileSizeMB === 20, 'Should respect custom maxFileSizeMB');
  assert(customCombiner.config.customOption === 'test', 'Should add custom option');
  console.log('✅ Configuration test passed');
  
  // More tests can be added here
  
  console.log('All tests completed!');
}

runTests().catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});