# @icjia/repo-combiner

[![npm version](https://img.shields.io/npm/v/@icjia/repo-combiner.svg)](https://www.npmjs.com/package/@icjia/repo-combiner)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@icjia/repo-combiner.svg)](https://nodejs.org/)

A Node.js tool that converts a GitHub repository into a single file. Compatible with Node.js 18+ and modern browsers.

## Features

- Converts an entire GitHub repository into a single file
- Works both as a command-line tool and as a browser-compatible module
- Multiple output formats: text, JSON, or markdown
- Skips unnecessary files and directories (node_modules, .git, etc.)
- User-friendly interface
- Support for large repositories
- Error handling and progress reporting
- Support for both private and public repositories

## Installation

### CLI Installation

To use Repo Combiner as a command-line tool, you can install it globally:

```bash
# Global installation
npm install -g @icjia/repo-combiner

# Verify installation
repo-combiner --version
```

### Project Installation

To use Repo Combiner in your project:

```bash
# Add to your project
npm install @icjia/repo-combiner

# Or with yarn
yarn add @icjia/repo-combiner
```

### Manual Installation (for development)

```bash
# Clone the repository
git clone https://github.com/ICJIA/repo-combiner-2025.git
cd repo-combiner-2025

# Install dependencies
npm install

# Link for local development (optional)
npm link
```

## CLI Usage

The command-line interface provides a simple way to convert repositories to a single file.

### Basic Usage

```bash
# Basic usage (outputs to console in text format)
repo-combiner https://github.com/username/repository

# Specify output format
repo-combiner --format markdown https://github.com/username/repository

# Save output to a file
repo-combiner --output result.md https://github.com/username/repository

# Specify format and output file
repo-combiner -f json -o result.json https://github.com/username/repository
```

### Private Repository Access

For private repositories, you can provide authentication:

```bash
# Using a GitHub token (recommended)
repo-combiner --token your_github_token https://github.com/username/private-repository

# Using username and password
repo-combiner --username your_username --password your_password https://github.com/username/private-repository

# Using environment variables (.env file)
# First create a .env file with GITHUB_TOKEN or GITHUB_USERNAME and GITHUB_PASSWORD
repo-combiner https://github.com/username/private-repository
```

### All CLI Options

```
Usage: repo-combiner [options] <repository-url>

Options:
  -h, --help                  Show this help
  -v, --version               Show version
  -f, --format <type>         Output format: text, json, or markdown (default: text)
  -o, --output <file>         Write output to a file (default: output/output.txt)
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
    <input type="text" id="repoUrl" placeholder="https://github.com/username/repository">
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
  import { createRepoCombiner } from 'https://cdn.skypack.dev/@icjia/repo-combiner';
  
  // Your code here
</script>
```

#### Option B: Using a bundler (Webpack, Rollup, Parcel, etc.)

If you're using a bundler, install the package first:

```bash
npm install @icjia/repo-combiner
```

Then import in your JavaScript file:

```javascript
import { createRepoCombiner } from '@icjia/repo-combiner';
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
      onProgress: updateProgress // Optional progress callback
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

1. Serving the project directory with a local server
   ```bash
   npx serve
   ```

2. Opening your browser to http://localhost:3000/example/browser-example.html

### 5. Handling CORS in Web Usage

When using Repo Combiner in a web application, you might encounter CORS (Cross-Origin Resource Sharing) issues when making requests to the GitHub API. To work around this:

- Use a CORS proxy for development
- Deploy a server-side component that handles GitHub API requests
- Use GitHub's CORS-enabled API endpoints where available

## API Reference

### Creating a Repo Combiner Instance

```javascript
import { createRepoCombiner } from '@icjia/repo-combiner';

const repoCombiner = createRepoCombiner({
  // Configuration options
  format: 'markdown',
  skipDirs: ['node_modules', '.git', 'dist'],
  skipFiles: ['.DS_Store'],
  maxFileSizeMB: 5,
  auth: {
    token: 'your_github_personal_access_token'
  },
  onProgress: (progressData) => {
    console.log(`Progress: ${progressData.message}`);
  }
});
```

### Processing a Repository

```javascript
// Simple usage
const output = await repoCombiner.processRepo('https://github.com/ICJIA/repo-combiner-2025');

// With additional options
const output = await repoCombiner.processRepo('https://github.com/ICJIA/repo-combiner-2025', {
  format: 'json', // Override the format for this specific call
  maxFileSizeMB: 2 // Override the max file size for this call
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | string | `'text'` | Output format: 'text', 'json', or 'markdown' |
| `skipDirs` | array | `['node_modules', '.git', 'dist', 'build', 'coverage', '.github', '.vscode']` | Directories to skip |
| `skipFiles` | array | `['.DS_Store', '.gitignore', 'package-lock.json', 'yarn.lock', '.eslintrc', '.prettierrc']` | Files to skip |
| `skipExtensions` | array | `['.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.mp3', '.mp4', '.zip', '.gz', '.exe', '.dll']` | File extensions to skip |
| `tempDir` | string | `os.tmpdir() + '/repo-combiner'` | Temporary directory for cloned repositories |
| `preserveStructure` | boolean | `true` | Preserve directory structure in output |
| `maxFileSizeMB` | number | `10` | Maximum file size to process (in MB) |
| `keepTemp` | boolean | `false` | Keep temporary files after processing |
| `concurrency` | number | `5` | Number of concurrent file operations |
| `timeout` | number | `300000` | Timeout for operations in milliseconds (5 minutes) |
| `auth` | object | `{ token: process.env.GITHUB_TOKEN, username: process.env.GITHUB_USERNAME, password: process.env.GITHUB_PASSWORD }` | GitHub authentication details |
| `onProgress` | function | `null` | Progress callback function |

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

## Project Structure

The project follows the standard Node.js package structure:

```
repo-combiner/
├── bin/                # Command-line interface
│   └── cli.js          # CLI entry point
├── src/                # Source code
│   └── repo-combiner.js # Main implementation
├── example/            # Examples
│   └── browser-example.html # Browser usage example
├── test/               # Tests
├── .env.example        # Example environment variables
├── package.json        # Package configuration
└── README.md           # Documentation
```

## Development

```bash
# Clone the repository
git clone https://github.com/ICJIA/repo-combiner-2025.git
cd repo-combiner-2025

# Install dependencies
npm install

# Run the CLI in development mode
npm run dev

# Lint the code
npm run lint

# Format the code
npm run format

# Run tests
npm test
```

## License

MIT