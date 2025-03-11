# Setting Up Tests for Repo Combiner

To set up and run the tests for this project, follow these instructions:

## 1. Install Dev Dependencies

First, make sure all development dependencies including Jest are installed:

```bash
npm install
```

Or if you prefer using Yarn:

```bash
yarn install
```

## 2. Running Tests

You can run all tests with:

```bash
npm test
```

Or run specific test suites:

```bash
# Run CLI tests only
npm run test:cli

# Run filename format tests only
npm run test:filename

# Run integration tests only
npm run test:integration

# Run tests in watch mode (for development)
npm run test:watch
```

## 3. Troubleshooting

If you encounter issues with Jest not being found:

```bash
# Install Jest explicitly
npm install --save-dev jest @jest/globals
```

For ESM compatibility issues, make sure Node.js is version 18 or higher:

```bash
node --version
```

The project is configured to work with ESM modules in Jest via the `--experimental-vm-modules` flag.
