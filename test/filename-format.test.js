import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createRepoCombiner } from '../src/repo-combiner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const outputDir = path.join(projectRoot, 'output');

// We won't mock the entire fs module, instead we'll use spyOn later

describe('Filename Format Tests', () => {
  let repoCombiner;

  beforeEach(() => {
    repoCombiner = createRepoCombiner();
    jest.clearAllMocks();

    // Mock fs functions
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    
    // Mock date to have consistent datetime in filenames
    // We'll use a specific date with UTC time to ensure consistency
    const mockDateInstance = new Date('2023-08-15T14:32:45.000Z');
    jest.spyOn(global, 'Date').mockImplementation(function() {
      return mockDateInstance;
    });
  });

  afterEach(() => {
    jest.spyOn(global, 'Date').mockRestore();
  });

  test('_getFormattedDateTime should return correct format', () => {
    const dateTime = repoCombiner._getFormattedDateTime();
    // Instead of exact matching, check format pattern
    expect(dateTime).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    // Also verify the date parts that are timezone-independent
    expect(dateTime).toContain('2023-08-15');
  });

  test('_addDateTimeToFilename should correctly format filenames', () => {
    const testCases = [
      { input: 'output.txt', extension: '.txt' },
      { input: 'repo-data.json', extension: '.json' },
      { input: 'path/to/output.md', extension: '.md' },
      { input: 'repository', extension: '' },
    ];

    testCases.forEach(({ input, extension }) => {
      const result = repoCombiner._addDateTimeToFilename(input);
      // Account for platform-specific path separators
      const normalizedResult = path.normalize(result);
      
      // Check format pattern instead of exact match
      expect(normalizedResult).toContain('2023-08-15');
      expect(normalizedResult).toMatch(new RegExp(`_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}${extension.replace('.', '\\.')}$`));
    });
  });

  test('saveToFile should use datetime in filename', async () => {
    const content = 'Test content';
    const outputPath = path.join(outputDir, 'test-file.txt');

    await repoCombiner.saveToFile(content, outputPath);

    // Check that writeFile was called with properly formatted filename
    // Use a more lenient check that only verifies the date part (not time)
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/_2023-08-15_\d{2}-\d{2}-\d{2}\.txt$/),
      content
    );
  });

  test('saveToFile handles different file formats', async () => {
    const formats = [
      { path: 'output.txt', content: 'Text content' },
      { path: 'output.md', content: '# Markdown Content' },
      { path: 'output.json', content: { key: 'value' } },
    ];

    for (const { path: filePath, content } of formats) {
      await repoCombiner.saveToFile(content, path.join(outputDir, filePath));

      const expectedContent =
        typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      expect(fs.writeFile).toHaveBeenLastCalledWith(
        expect.stringMatching(new RegExp(`_2023-08-15_\\d{2}-\\d{2}-\\d{2}\\.${filePath.split('.').pop()}$`)),
        expectedContent
      );
    }
  });

  test('saveToFile creates directory if it does not exist', async () => {
    await repoCombiner.saveToFile('content', path.join(outputDir, 'nested/dir/file.txt'));
    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('nested/dir'), expect.anything());
  });
});
