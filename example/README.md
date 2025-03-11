# Repo Combiner Web Implementations

This directory contains three different implementations of the Repo Combiner web interface, each using a different front-end technology but with identical UI and functionality.

## Implementations

### 1. Vanilla JavaScript

The Vanilla JavaScript implementation uses no framework, just plain JavaScript and HTML.

- [View Vanilla JS Implementation](./vanilla/index.html)
- No build steps required, just open the HTML file in a browser

### 2. Vue 3

The Vue 3 implementation uses Vue.js 3 with the Options API.

- [View Vue 3 Implementation](./vue/index.html)
- Uses Vue 3 CDN, no build steps required

### 3. Svelte 5

The Svelte 5 implementation uses Svelte 5's runes in a minimal setup.

- [View Svelte 5 Implementation](./svelte/index.html)
- Uses Svelte 5 runtime via CDN, no build steps required

## Common Features in All Implementations

- GitHub repository URL input
- Output format selection (text, markdown, JSON)
- Authentication options for private repositories
- Progress indication during processing
- Error handling
- Copy and download functionality for results
- Markdown rendering using marked.js

## Usage

1. Open any of the implementations in a modern web browser
2. Enter a GitHub repository URL (or use the default)
3. Select an output format (text, markdown, or JSON)
4. Add authentication if required for private repositories
5. Click "Process Repository" to start processing
6. View the resulting output, with options to copy or download

## Shared Resources

- [Shared CSS Styles](./shared/styles.css) - Common styling used across all implementations
- [Marked.js](https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js) - Markdown rendering library

## Technical Notes

- All implementations import the core `repo-combiner.js` module from the `src` directory
- The implementations are designed to work directly in the browser without build steps
- Each implementation provides identical functionality with the same UI
- The code is organized to showcase each framework's approach to the same tasks
