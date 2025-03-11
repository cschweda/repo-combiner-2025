import { jest } from '@jest/globals';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '../bin/cli.js');
const testOutputDir = path.join(__dirname, '../test-output');

// Create a mock module for repo-combiner.js
jest.mock('../src/repo-combiner.js', () => {
  const mockStats = {
    totalFiles: 10,
    totalSize: 1024 * 500,
    elapsedTime: 1200,
    totalTokens: 15000,
  };

  const mockFiles = [{ path: 'file1.js', content: 'console.log("Hello");', lines: 1 }];

  const mockInstance = {
    processRepo: jest.fn(async (url, options = {}) => {
      if (url === 'https://github.com/error/repo') {
        throw new Error('Mock repository processing error');
      }

      if (url === 'https://github.com/rate-limit/repo') {
        throw new Error('API rate limit exceeded for your IP (60 requests per hour)');
      }

      if (
        url === 'https://github.com/auth-error/repo' ||
        options?.auth?.token === 'invalid-token'
      ) {
        throw new Error('Authentication failed. Please check your credentials.');
      }

      if (url === 'https://github.com/not-found/repo') {
        throw new Error('Repository not found');
      }

      // Format-specific mock responses
      const format = options?.format || 'text';

      // Simulate successful processing
      mockInstance.stats = { ...mockStats };
      mockInstance.files = [...mockFiles];

      if (format === 'json') {
        return {
          repository: url,
          stats: mockStats,
          files: mockFiles,
        };
      } else if (format === 'markdown') {
        return `# Repository ${url}\n\n## File: file1.js\n\n\`\`\`javascript\nconsole.log("Hello");\n\`\`\``;
      } else {
        return `Repository: ${url}\n\n--- file1.js ---\nconsole.log("Hello");\n`;
      }
    }),
    stats: { ...mockStats },
    files: [...mockFiles],
  };

  return {
    createRepoCombiner: jest.fn(() => mockInstance),
    __mockInstance: mockInstance,
  };
});

// Helper function to run CLI commands
function runCli(args = '') {
  return new Promise((resolve, reject) => {
    // Use execFile to run the CLI script
    execFile(
      process.execPath,
      [cliPath, ...args.split(' ').filter(Boolean)],
      { env: { ...process.env, NODE_ENV: 'test' } },
      (error, stdout, stderr) => {
        resolve({ stdout, stderr, error });
      }
    );
  });
}

// Clean up test files before tests
beforeEach(async () => {
  try {
    // Ensure test output directory exists
    await fs.mkdir(testOutputDir, { recursive: true });

    // Clean any previous test files
    const files = await fs.readdir(testOutputDir);
    await Promise.all(
      files
        .filter(file => file !== '.gitkeep')
        .map(file => fs.unlink(path.join(testOutputDir, file)))
    );
  } catch (err) {
    console.error('Error in test setup:', err);
  }

  // Reset the jest mocks
  jest.clearAllMocks();
});

describe('CLI Basic Tests', () => {
  // Basic functionality tests
  test('displays help when --help flag is used', async () => {
    const { stdout } = await runCli('--help');
    expect(stdout).toContain('Usage: repo-combiner [options] <repository-url>');
    expect(stdout).toContain('-f, --format <type>');
    expect(stdout).toContain('-o, --output');
  });

  test('displays version when --version flag is used', async () => {
    const { stdout } = await runCli('--version');
    expect(stdout).toMatch(/repo-combiner v\d+\.\d+\.\d+/);
  });

  test('shows error for invalid repository URL', async () => {
    const { stderr } = await runCli('not-a-valid-url');
    expect(stderr).toContain('Invalid repository URL format');
  });
});

// Separate the more complex processing tests
// For these we'll use a test repo instead of trying to mock across process boundary
describe('CLI Processing Tests', () => {
  test('shows error message for non-existent repository', async () => {
    const { stderr } = await runCli(
      'https://github.com/not-a-real-user-123456789/not-a-real-repo-123456789'
    );
    expect(stderr).toContain('repository');
  });

  // Jest mock doesn't affect the CLI process, so we can't assert on mocks working across processes
  test('handles format validation', async () => {
    const { stderr } = await runCli('--format invalid-format https://github.com/test/repo');
    expect(stderr).toContain('Invalid format');
    expect(stderr).toContain('Valid formats are: text, markdown, json');
  });
});

// Output file testing using a real public repository
describe('CLI Output File Tests', () => {
  const PUBLIC_TEST_REPO = 'https://github.com/expressjs/express';
  const OUTPUT_TIMEOUT = 30000; // 30 seconds for larger repo tests

  // These tests work with real repositories and may take longer
  test(
    'saves output to a specified file',
    async () => {
      // Use absolute path for test output
      const outputBase = path.resolve(testOutputDir, 'test-output');

      // Run the CLI with a small, public test repository
      const { stdout, stderr } = await runCli(`-o ${outputBase} ${PUBLIC_TEST_REPO}`);
      
      if (stderr) console.error('CLI ERROR:', stderr);
      
      // Check that a file was created with the expected format
      const files = await fs.readdir(testOutputDir);
      console.log('Files in test output dir:', files);
      
      const outputFile = files.find(
        file => file.startsWith('test-output_') && file.endsWith('.txt')
      );

      expect(outputFile).toBeTruthy();
    },
    OUTPUT_TIMEOUT
  );

  test(
    'uses correct extension based on format',
    async () => {
      // Test with JSON format
      const jsonOutputPath = path.resolve(testOutputDir, 'json-test');
      const { stdout, stderr } = await runCli(`-f json -o ${jsonOutputPath} ${PUBLIC_TEST_REPO}`);
      
      if (stderr) console.error('CLI ERROR:', stderr);
      
      // Check that a file was created with the expected format
      const files = await fs.readdir(testOutputDir);
      console.log('Files in test output dir for JSON test:', files);
      
      const jsonFile = files.find(file => file.startsWith('json-test_') && file.endsWith('.json'));

      expect(jsonFile).toBeTruthy();
    },
    OUTPUT_TIMEOUT
  );
});
