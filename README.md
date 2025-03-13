# repo-combiner

[![npm version](https://img.shields.io/npm/v/repo-combiner.svg)](https://www.npmjs.com/package/repo-combiner)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/repo-combiner.svg)](https://nodejs.org/)

A Node.js tool that converts a GitHub repository into a single file with built-in token counting. Compatible with Node.js 18+ and modern browsers.

## Quick Start

```bash
# Install globally
npm install -g repo-combiner

# Process a repository (outputs to console)
repo-combiner https://github.com/username/repository

# Save as markdown file
repo-combiner --format markdown --output repo-content https://github.com/username/repository
# Creates: repo-content_2023-08-15_14-32-45.md
```

**What It Does:** Combines all files in a GitHub repo into a single document to provide complete context for AI tools and code analysis.

**Key Features:**

- Formats output as text, markdown, or JSON
- Counts tokens to estimate AI model compatibility
- Works in Node.js and browser environments
- Preserves file structure and metadata

## Table of Contents

- [Why Use Repo Combiner](#why-use-repo-combiner)
- [Installation](#installation)
- [CLI Usage](#cli-usage)
- [Web Usage](#web-usage)
- [API Reference](#api-reference)
- [Output Formats](#output-format-examples)
- [Token Counting](#token-counting-and-ai-compatibility)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Platform Support](#platform-support)
- [License](#license)

## Why Use Repo Combiner

### Complete Context for AI Models

Modern AI tools like ChatGPT, Claude, and GitHub Copilot have limited "context windows" - the amount of text they can process at once. Repo Combiner helps by:

- **Consolidating entire repositories** into a single, well-structured file
- **Removing unnecessary files** (node_modules, binary files, etc.)
- **Providing token metrics** to determine compatibility with various AI models
- **Preserving file structure** to maintain relationships between code files

### Use Cases

#### Code Analysis

- Generate comprehensive code reviews with cross-file context
- Identify architectural patterns and anti-patterns
- Assess technical debt across the entire project

#### Documentation

- Create comprehensive documentation from full project context
- Generate onboarding guides for new developers
- Build architecture diagrams with full system understanding

#### Migration & Modernization

- Plan migrations between frameworks with complete context
- Update legacy codebases to modern patterns
- Refactor with full understanding of dependencies

#### AI Training & Research

- Prepare training data for fine-tuning code models
- Study architecture patterns across repositories
- Create detailed educational content from real-world code

## Installation

### CLI Installation

```bash
# Global installation
npm install -g repo-combiner

# Verify installation
repo-combiner --version
```

### Project Installation

```bash
# Add to your project
npm install repo-combiner

# Or with yarn
yarn add repo-combiner
```

### Manual Installation (for development)

```bash
# Clone the repository
git clone https://github.com/cschweda/repo-combiner-2025.git
cd repo-combiner-2025

# Install dependencies
npm install

# Link for local development (optional)
npm link
```

## CLI Usage

### Basic Usage

```bash
# Basic usage (outputs to console in text format)
repo-combiner https://github.com/username/repository

# Specify output format
repo-combiner --format markdown https://github.com/username/repository

# Save output to a file (automatically adds datetime to filename)
repo-combiner --output result https://github.com/username/repository
# Creates: result_2023-08-15_14-32-45.md
```

### Private Repository Access

```bash
# Using a GitHub token (recommended)
repo-combiner --token your_github_token https://github.com/username/private-repository

# Using environment variables (.env file)
# First create a .env file with GITHUB_TOKEN
repo-combiner https://github.com/username/private-repository
```

### All CLI Options

```
Usage: repo-combiner [options] <repository-url>

Options:
  -h, --help                  Show this help
  -v, --version               Show version
  -f, --format <type>         Output format: text, json, or markdown (default: text)
  -o, --output <file>         Write output to a file (default: output/repo-output)
                              Automatically appends datetime and extension to filename
                              Example: output/repo-output_2023-08-15_14-32-45.json
  -k, --keep-temp             Keep temporary files
  -t, --token <token>         GitHub personal access token (for private repositories)
  -u, --username <username>   GitHub username (for private repositories)
  -p, --password <password>   GitHub password (for private repositories)
```

## Web Usage

You can use Repo Combiner in a web application. Here's a step-by-step guide:

### 1. Setup

First, create your HTML file with the necessary UI elements:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Repo Combiner Web</title>
    <style>
      /* Add your styles here */
    </style>
  </head>
  <body>
    <h1>Repo Combiner Web Interface</h1>

    <div class="form">
      <input type="text" id="repoUrl" placeholder="https://github.com/username/repository" />
      <select id="format">
        <option value="text">Text</option>
        <option value="markdown">Markdown</option>
        <option value="json">JSON</option>
      </select>
      <button id="processButton">Process Repository</button>
    </div>

    <div class="output" id="output"></div>

    <script type="module">
      // Your JavaScript will go here
    </script>
  </body>
</html>
```

### 2. Import the Module

You have a few options to import the module:

#### Option A: Using ES Modules (recommended for modern apps)

```html
<script type="module">
  // Import directly from npm through a CDN like Skypack or UNPKG
  import { createRepoCombiner } from 'https://cdn.skypack.dev/repo-combiner';

  // Your code here
</script>
```

#### Option B: Using a bundler (Webpack, Rollup, Parcel, etc.)

If you're using a bundler, install the package first:

```bash
npm install repo-combiner
```

Then import in your JavaScript file:

```javascript
import { createRepoCombiner } from 'repo-combiner';
```

### 3. Implement Repository Processing

```javascript
document.getElementById('processButton').addEventListener('click', async () => {
  const repoUrl = document.getElementById('repoUrl').value;
  const format = document.getElementById('format').value;
  const outputElement = document.getElementById('output');

  if (!repoUrl) {
    outputElement.innerHTML = '<p class="error">Please enter a repository URL</p>';
    return;
  }

  outputElement.innerHTML = '<p>Processing repository, please wait...</p>';

  try {
    // Create the repo combiner instance
    const repoCombiner = createRepoCombiner({
      format: format,
      onProgress: updateProgress, // Optional progress callback
    });

    // Process the repository
    const result = await repoCombiner.processRepo(repoUrl);

    // Display the result
    if (format === 'markdown') {
      // If using markdown, you might want to render it
      // You can use a library like marked: https://marked.js.org/
      outputElement.innerHTML = `<div class="markdown">${marked(result)}</div>`;
    } else if (format === 'json') {
      // For JSON, pretty print it
      outputElement.innerHTML = `<pre>${JSON.stringify(JSON.parse(result), null, 2)}</pre>`;
    } else {
      // For text, use a pre element
      outputElement.innerHTML = `<pre>${result}</pre>`;
    }
  } catch (error) {
    outputElement.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
});

// Optional: Progress update function
function updateProgress(progressData) {
  const progressElement = document.getElementById('progress');
  if (progressElement && progressData.message) {
    progressElement.textContent = progressData.message;

    // If you have a progress bar
    if (progressData.progress !== undefined) {
      const progressBar = document.getElementById('progressBar');
      if (progressBar) {
        progressBar.value = progressData.progress * 100;
      }
    }
  }
}
```

### 4. Complete Example

For a complete working example, check out the file in the repository:

```
example/browser-example.html
```

You can run this example by:

#### Running Web Examples (All Platforms)

1. Serving the project directory with a local server

   ```bash
   npx serve
   ```

2. Opening your browser to http://localhost:3000/example/browser-example.html

#### More Example Files to Try

- **Basic Example**: `example/browser-example.html` - Simple usage demo
- **Advanced Tests**: `example/browser-tests.html` - More advanced features
- **Comprehensive Tests**: `example/comprehensive-browser-tests.html` - Full test suite
- **Framework Implementations**:
  - Vue.js: `example/vue/index.html` - Vue 3 implementation
  - Svelte: `example/svelte/index.html` - Svelte implementation
  - Vanilla JS: `example/vanilla/index.html` - No-framework implementation
  - **Vite**: `example/vite-example/` - Modern build tool with hot reloading

#### Platform-Specific Notes for Web Examples

**Windows**:

- If you have issues with `npx serve`, you can also use Python's built-in HTTP server:
  ```
  python -m http.server 3000
  ```
- Some browsers might block local file access. Use a web server like described above.

**Linux/macOS**:

- You can also use Python's HTTP server as an alternative:
  ```
  python3 -m http.server 3000
  ```
- For development with hot-reloading, you can use:
  ```
  npx browser-sync start --server --files "example/**/*"
  ```

### 5. Using with Modern Build Tools (Vite)

Repo Combiner works seamlessly with modern build tools like Vite. The project includes a complete Vite example that demonstrates how to integrate repo-combiner into a Vite application.

#### Setting up a Vite Project with Repo Combiner

1. **Create a new Vite project**:

   ```bash
   npm create vite@latest my-repo-combiner-app
   cd my-repo-combiner-app
   ```

2. **Install dependencies**:

   ```bash
   npm install marked
   ```

3. **Create a browser-specific implementation**:
   Since `repo-combiner` uses Node.js modules that aren't available in the browser, you need to use a browser-specific implementation:

   ```bash
   # Copy the browser-repo-combiner.js file from the example directory
   cp /path/to/repo-combiner-2025/example/vite-example/browser-repo-combiner.js ./
   ```

4. **Import and use in your Vite app**:

   ```javascript
   // main.js
   import './style.css';
   import { marked } from 'marked';
   // Import the browser-specific implementation
   import { createRepoCombiner } from './browser-repo-combiner';

   // Create repo combiner instance
   const repoCombiner = createRepoCombiner({
     format: 'markdown',
     onProgress: status => {
       console.log(status.message);
     },
   });

   // Process repository
   repoCombiner.processRepo('https://github.com/expressjs/express').then(result => {
     document.querySelector('#output').innerHTML = marked.parse(result);
   });
   ```

5. **Running the Vite example with proxy server**:

   ```bash
   # Navigate to the Vite example
   cd example/vite-example

   # Install dependencies
   npm install

   # Start both the Vite dev server and proxy server
   npm start

   # Or run them separately in different terminals:
   npm run dev    # Start Vite dev server
   npm run proxy  # Start proxy server
   ```

The Vite example includes:

- Complete UI with progress reporting
- Local proxy server to bypass CORS restrictions
- Token assessment display showing if content will fit in AI chat windows
- Multiple output formats (text, JSON, markdown)
- Copy and download capabilities
- Authentication options for private repositories

### 6. Handling API Limits and CORS in Web Usage

#### GitHub API Rate Limits

When using Repo Combiner in a browser context, you may encounter GitHub API rate limits (60 requests per hour for unauthenticated requests). To increase this limit:

1. **Use GitHub Authentication**: Provide a GitHub personal access token to increase your rate limit to 5,000 requests per hour:

   ```javascript
   const repoCombiner = createRepoCombiner({
     auth: { token: 'your-github-token' },
   });
   ```

2. **Optimize API Usage**: The browser implementation makes multiple GitHub API requests (repository info, directory listings, file contents).

3. **Use Small Repositories**: For testing or demos, use smaller repositories with fewer files.

4. **Display Helpful Error Messages**: When rate limits are hit, display helpful instructions to users about authentication:
   ```javascript
   try {
     // Process repository
   } catch (error) {
     if (error.message.includes('API rate limit')) {
       showHelpfulRateLimitMessage();
     }
   }
   ```

#### CORS Limitations

Browser security restrictions (CORS) prevent direct requests to GitHub's raw content URLs from browser-based applications. There are several ways to handle this:

1. **Implement a server-side proxy**:

   ```javascript
   // Server-side proxy example (Express.js)
   app.get('/proxy/github/:owner/:repo/:branch/*', async (req, res) => {
     const { owner, repo, branch } = req.params;
     const path = req.params[0];
     const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

     try {
       const response = await fetch(url);
       const content = await response.text();
       res.send(content);
     } catch (error) {
       res.status(500).send(`Error fetching: ${error.message}`);
     }
   });
   ```

2. **Use GitHub's API instead of raw URLs**: The GitHub API's `contents` endpoint can be used with proper authentication and works around CORS issues.

3. **Use a CORS proxy service**: For development and testing only (not for production):

   ```javascript
   // Example for development only - not for production
   const corsProxyUrl = 'https://cors-anywhere.herokuapp.com/';
   const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
   const proxiedUrl = corsProxyUrl + rawUrl;

   fetch(proxiedUrl).then(response => response.text());
   ```

4. **Use server-side rendering**: Process repositories server-side and deliver only the results to the browser.

#### Browser-specific Implementation

When using Repo Combiner in a browser environment, a specialized browser-specific implementation is required that avoids Node.js dependencies:

```javascript
// Import the browser-specific implementation
import { createRepoCombiner } from './browser-repo-combiner';

// Or adapt your code to handle both environments
const repoCombiner =
  typeof window !== 'undefined'
    ? createBrowserRepoCombiner(options)
    : createNodeRepoCombiner(options);
```

The Vite example in `example/vite-example` demonstrates a browser-specific implementation.

## API Reference

### Creating a Repo Combiner Instance

```javascript
import { createRepoCombiner } from 'repo-combiner';

const repoCombiner = createRepoCombiner({
  // Configuration options
  format: 'markdown',
  skipDirs: ['node_modules', '.git', 'dist'],
  skipFiles: ['.DS_Store'],
  maxFileSizeMB: 5,
  auth: {
    token: 'your_github_personal_access_token',
  },
  onProgress: progressData => {
    console.log(`Progress: ${progressData.message}`);
  },
});
```

### Processing a Repository

```javascript
// Simple usage
const output = await repoCombiner.processRepo('https://github.com/cschweda/repo-combiner-2025');

// With additional options
const output = await repoCombiner.processRepo('https://github.com/cschweda/repo-combiner-2025', {
  format: 'json', // Override the format for this specific call
  maxFileSizeMB: 2, // Override the max file size for this call
  output: 'my-repo-data', // Will save as my-repo-data_2023-08-15_14-32-45.json
});
```

### Configuration Options

| Option              | Type     | Default                                                                                                                                       | Description                                                           |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `format`            | string   | `'text'`                                                                                                                                      | Output format: 'text', 'json', or 'markdown'                          |
| `output`            | string   | `'output/repo-output'`                                                                                                                        | Base filename for output (datetime and extension automatically added) |
| `skipDirs`          | array    | `['node_modules', '.git', 'dist', 'build', 'coverage', '.github', '.vscode']`                                                                 | Directories to skip                                                   |
| `skipFiles`         | array    | `['.DS_Store', '.gitignore', 'package-lock.json', 'yarn.lock', '.eslintrc', '.prettierrc']`                                                   | Files to skip                                                         |
| `skipExtensions`    | array    | `['.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.mp3', '.mp4', '.zip', '.gz', '.exe', '.dll']` | File extensions to skip                                               |
| `tempDir`           | string   | `os.tmpdir() + '/repo-combiner'`                                                                                                              | Temporary directory for cloned repositories                           |
| `preserveStructure` | boolean  | `true`                                                                                                                                        | Preserve directory structure in output                                |
| `maxFileSizeMB`     | number   | `10`                                                                                                                                          | Maximum file size to process (in MB)                                  |
| `keepTemp`          | boolean  | `false`                                                                                                                                       | Keep temporary files after processing                                 |
| `concurrency`       | number   | `5`                                                                                                                                           | Number of concurrent file operations                                  |
| `timeout`           | number   | `300000`                                                                                                                                      | Timeout for operations in milliseconds (5 minutes)                    |
| `auth`              | object   | `{ token: process.env.GITHUB_TOKEN, username: process.env.GITHUB_USERNAME, password: process.env.GITHUB_PASSWORD }`                           | GitHub authentication details                                         |
| `onProgress`        | function | `null`                                                                                                                                        | Progress callback function                                            |

### Event Callbacks

The `onProgress` callback receives an object with the following properties:

```javascript
{
  message: "Processing file 10/50: src/index.js", // Human-readable progress message
  progress: 0.45, // Number between 0-1 indicating progress percentage
  phase: "processing", // Current phase: 'initializing', 'cloning', 'processing', 'generating', 'cleaning', 'complete', 'error'
  stats: {
    totalFiles: 10, // Files processed so far
    totalSize: 1024 * 500, // Total size in bytes
    skippedFiles: 5, // Files skipped
    skippedSize: 1024 * 1000, // Size of skipped files in bytes
    // Other stats...
  },
  timestamp: "2023-03-15T12:34:56.789Z" // ISO timestamp of the progress update
}
```

## Output Format Examples

### Text Format

```
---- File: src/utils/formatter.js ----
GitHub: https://github.com/username/repo/blob/main/src/utils/formatter.js
Stats: 4.5KB, 120 lines, Modified: 2023-06-15

// File content here
```

### Markdown Format

````markdown
## File: src/components/Button.jsx

**[View on GitHub](https://github.com/username/repo/blob/main/src/components/Button.jsx)**

**Stats:** 2.1KB | 89 lines | Modified: 2023-07-22

```jsx
import React from 'react';
// Component code here
```
````

### JSON Format

```json
{
  "repository": "https://github.com/username/repo",
  "generatedAt": "2023-08-01T12:34:56Z",
  "files": [
    {
      "path": "src/index.js",
      "githubUrl": "https://github.com/username/repo/blob/main/src/index.js",
      "stats": {
        "size": 4608,
        "sizeFormatted": "4.5KB",
        "lines": 120,
        "modified": "2023-06-15T14:32:10Z"
      },
      "content": "// File content here"
    }
    // More files...
  ],
  "stats": {
    "totalFiles": 45,
    "totalSize": 256000,
    "totalSizeFormatted": "250KB",
    "processingTime": "1.2s",
    "tokenCount": 52480
  }
}
```

## Filename Format

All saved files automatically include a datetime stamp in their filenames for better organization and to prevent overwriting previous outputs:

```
[base-filename]_[YYYY-MM-DD]_[HH-MM-SS].[extension]
```

Examples:

- `react-app_2023-08-15_14-32-45.md`
- `tensorflow_2023-08-16_09-15-22.json`
- `express-server_2023-08-17_18-05-37.txt`

## Development

```bash
# Clone the repository
git clone https://github.com/cschweda/repo-combiner-2025.git
cd repo-combiner-2025

# Install dependencies
npm install

# Run the CLI in development mode
npm run dev

# Lint the code
npm run lint

# Format the code
npm run format
```

## Testing

The project includes several test suites:

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:node        # Run Node.js environment tests
npm run test:browser     # Instructions for browser-based tests
npm run test:cli         # Test CLI functionality
npm run test:filename    # Test filename formatting
npm run test:integration # Run integration tests
npm run test:simplified  # Run simplified test suite
```

For browser tests, open `example/comprehensive-browser-tests.html` in your web browser.

## License

MIT
