// Runs all Node.js tests for repo-combiner
import { runNodeTests } from './node-tests.js';

async function runAllTests() {
  console.log('='.repeat(50));
  console.log('Running all Node.js tests for repo-combiner');
  console.log('='.repeat(50));
  
  try {
    await runNodeTests();
    
    console.log('\n='.repeat(50));
    console.log('✅ All tests passed!');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('\n='.repeat(50));
    console.error('❌ Tests failed!');
    console.error(error);
    console.error('='.repeat(50));
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});