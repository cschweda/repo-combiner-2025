#!/usr/bin/env node

/**
 * Simple Express proxy server for GitHub API requests to avoid CORS issues
 * This allows the browser version of repo-combiner to work in local development
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { createRequire } from 'module';
import { createLogger } from '../../src/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

// Create logger for the proxy server
const logger = createLogger({
  name: 'proxy-server',
  logDir: path.join(projectRoot, 'logs'),
  logLevel: process.env.LOG_LEVEL || 'INFO',
  enableConsole: true,
  enableFileLogging: true
});

logger.info('Proxy server initializing', {
  nodeVersion: process.version,
  platform: process.platform
});

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

const app = express();
const PORT = process.env.PORT || 3010;

// Configure CORS to allow requests from Vite dev server
logger.debug('Configuring CORS settings');
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware to parse JSON
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  logger.debug(`Request received: ${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    headers: req.headers,
  });
  
  // Add response logging
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - start;
    const contentLength = body ? body.length : 0;
    
    logger.debug(`Response sent: ${res.statusCode} (${duration}ms)`, {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentType: res.get('Content-Type'),
      contentLength
    });
    
    return originalSend.apply(this, arguments);
  };
  
  next();
});

// Utility function to handle fetch errors
const fetchWithErrorHandling = async (url, options = {}) => {
  logger.debug(`Fetching URL: ${url}`, { options });
  
  try {
    const start = Date.now();
    const response = await fetch(url, options);
    const duration = Date.now() - start;
    
    logger.debug(`Received response: ${response.status} ${response.statusText} (${duration}ms)`, {
      url,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
        logger.debug('Parsed error response data', { errorData });
      } catch (e) {
        errorData = {};
        logger.debug('Failed to parse error response as JSON', { 
          error: e.message,
          responseStatusText: response.statusText 
        });
      }
      
      const error = new Error(`${response.status} ${response.statusText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.headers = Object.fromEntries(response.headers.entries());
      error.data = errorData;
      
      logger.error(`Fetch error: ${error.message}`, {
        url,
        status: error.status,
        statusText: error.statusText,
        errorData
      });
      
      throw error;
    }
    
    return response;
  } catch (error) {
    // Network or other fetch errors
    if (!error.status) {
      logger.error(`Network error fetching ${url}:`, {
        error: error.message,
        stack: error.stack
      });
    }
    
    console.error(`Error fetching ${url}:`, error.message);
    throw error;
  }
};

// Server start time
const startTime = new Date();
logger.info('Server start time recorded', { startTime: startTime.toISOString() });

// Root endpoint with status info
app.get('/', (req, res) => {
  const currentTime = new Date();
  const uptimeMs = currentTime - startTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  
  const formattedUptime = `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`;
  
  logger.debug('Root endpoint accessed', { 
    uptime: formattedUptime,
    uptimeMs
  });
  
  const response = {
    status: 'ok',
    message: 'GitHub API proxy server for repo-combiner',
    version: packageJson.version,
    serverInfo: {
      startTime: startTime.toISOString(),
      currentTime: currentTime.toISOString(),
      uptime: formattedUptime,
      uptimeMs: uptimeMs
    },
    endpoints: {
      '/': 'Server status and info',
      '/ping': 'Connection test endpoint',
      '/github-test': 'Test GitHub API connection',
      '/repo/:owner/:repo': 'Repository information',
      '/contents/:owner/:repo/:branch/*': 'File or directory contents',
      '/raw/:owner/:repo/:branch/*': 'Raw file content',
      '/logs': 'Server logs (if enabled)'
    }
  };
  
  res.json(response);
});

// Simple ping endpoint for connection testing
app.get('/ping', (req, res) => {
  logger.debug('Ping endpoint accessed');
  res.json({
    status: 'ok',
    message: 'Proxy server is responding',
    timestamp: new Date().toISOString()
  });
});

// Logs endpoint to get server logs
app.get('/logs', (req, res) => {
  const logFormat = req.query.format || 'json';
  const limit = parseInt(req.query.limit) || 1000;
  
  logger.info('Logs endpoint accessed', { format: logFormat, limit });
  
  if (logFormat === 'json') {
    const logs = logger.getAllLogs().slice(-limit);
    res.json({
      status: 'ok',
      count: logs.length,
      logs: logs
    });
  } else if (logFormat === 'text') {
    const logs = logger.getLogsAsString().split('\n').slice(-limit).join('\n');
    res.type('text/plain').send(logs);
  } else {
    logger.warn('Invalid log format requested', { requestedFormat: logFormat });
    res.status(400).json({
      status: 'error',
      message: `Invalid format: ${logFormat}. Valid formats are: json, text`
    });
  }
});

// Test GitHub API connection
app.get('/github-test', async (req, res) => {
  logger.info('GitHub test endpoint accessed');
  
  try {
    // Try to reach GitHub API
    logger.debug('Testing GitHub API connection via /zen endpoint');
    const start = Date.now();
    const response = await fetch('https://api.github.com/zen', {
      headers: {
        'User-Agent': `repo-combiner/${packageJson.version}`
      }
    });
    const duration = Date.now() - start;
    
    logger.debug(`GitHub API test response: ${response.status} (${duration}ms)`, {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      duration: `${duration}ms`
    });
    
    if (response.ok) {
      const data = await response.text();
      logger.info('GitHub API connection successful', { 
        responseText: data,
        responseTime: duration
      });
      
      res.json({
        status: 'ok',
        message: 'GitHub API connection successful',
        githubResponse: data,
        responseTimeMs: duration,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error(`GitHub API test failed with status ${response.status}`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      res.status(response.status).json({
        status: 'error',
        message: `GitHub API returned status: ${response.status} ${response.statusText}`,
        responseTimeMs: duration,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('GitHub API connection test failed', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'error',
      message: `GitHub API connection failed: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// Repository info endpoint
app.get('/repo/:owner/:repo', async (req, res) => {
  const { owner, repo } = req.params;
  const authHeader = req.headers.authorization;
  
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const options = {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': `repo-combiner/${packageJson.version}`,
      }
    };
    
    if (authHeader) {
      options.headers['Authorization'] = authHeader;
    }
    
    const response = await fetchWithErrorHandling(url, options);
    const data = await response.json();
    
    res.json(data);
  } catch (error) {
    console.error(`Error fetching repo info for ${owner}/${repo}:`, error.message);
    
    const errorResponse = {
      error: true,
      message: error.message,
      status: error.status || 500,
    };
    
    if (error.data) {
      errorResponse.details = error.data;
    }
    
    res.status(error.status || 500).json(errorResponse);
  }
});

// Directory contents endpoint
app.get('/contents/:owner/:repo/:branch/*', async (req, res) => {
  const { owner, repo, branch } = req.params;
  const path = req.params[0] || '';
  const authHeader = req.headers.authorization;
  
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const options = {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': `repo-combiner/${packageJson.version}`,
      }
    };
    
    if (authHeader) {
      options.headers['Authorization'] = authHeader;
    }
    
    const response = await fetchWithErrorHandling(url, options);
    const data = await response.json();
    
    res.json(data);
  } catch (error) {
    console.error(`Error fetching contents for ${owner}/${repo}/${path}:`, error.message);
    
    res.status(error.status || 500).json({
      error: true,
      message: error.message,
      status: error.status || 500,
      details: error.data
    });
  }
});

// Raw file content endpoint
app.get('/raw/:owner/:repo/:branch/*', async (req, res) => {
  const { owner, repo, branch } = req.params;
  const path = req.params[0] || '';
  const authHeader = req.headers.authorization;
  
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    
    // Log the request details
    console.log(`[${new Date().toISOString()}] Fetching raw file: ${url}`);
    
    const options = {
      headers: {
        'User-Agent': `repo-combiner/${packageJson.version}`,
      }
    };
    
    if (authHeader) {
      options.headers['Authorization'] = authHeader;
      console.log(`[${new Date().toISOString()}] Using authorization header`);
    }
    
    // Check if the URL doesn't end with a valid file extension
    if (!path.match(/\.[a-zA-Z0-9]+$/)) {
      console.log(`[${new Date().toISOString()}] Warning: URL might be a directory or doesn't end with a file extension: ${path}`);
    }
    
    // Make the fetch request
    try {
      const response = await fetch(url, options);
      
      // Log the response status
      console.log(`[${new Date().toISOString()}] GitHub response status: ${response.status} ${response.statusText}`);
      
      // Handle error status codes
      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({
            error: true,
            message: `File not found: ${path}`,
            status: 404,
            url: url,
            details: {
              owner,
              repo,
              branch,
              path
            }
          });
        }
        
        // Try to parse error response
        let errorData = {};
        try {
          const errorText = await response.text();
          console.log(`[${new Date().toISOString()}] Error response body: ${errorText.substring(0, 200)}...`);
          
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { raw: errorText };
          }
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Failed to read error response:`, err.message);
        }
        
        return res.status(response.status).json({
          error: true,
          message: `GitHub returned status: ${response.status} ${response.statusText}`,
          status: response.status,
          url: url,
          details: errorData
        });
      }
      
      // Get content type and other headers
      const contentType = response.headers.get('content-type');
      console.log(`[${new Date().toISOString()}] Content-Type: ${contentType}`);
      
      // Set the correct content type
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      
      // Stream the response
      response.body.pipe(res);
    } catch (fetchError) {
      console.error(`[${new Date().toISOString()}] Fetch error:`, fetchError);
      
      res.status(500).json({
        error: true,
        message: `Failed to fetch from GitHub: ${fetchError.message}`,
        status: 500,
        url: url
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching raw content for ${owner}/${repo}/${path}:`, error.message);
    
    res.status(error.status || 500).json({
      error: true,
      message: error.message,
      status: error.status || 500,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
      details: error.data
    });
  }
});

// Add request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Start the server
app.listen(PORT, () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] GitHub API proxy server running at http://localhost:${PORT}`);
  console.log(`[${timestamp}] Serving repo-combiner version ${packageJson.version}`);
  
  logger.info('Server started successfully', {
    port: PORT,
    version: packageJson.version,
    startTime: timestamp,
    endpoints: [
      'http://localhost:' + PORT + '/',
      'http://localhost:' + PORT + '/ping',
      'http://localhost:' + PORT + '/github-test',
      'http://localhost:' + PORT + '/repo/:owner/:repo',
      'http://localhost:' + PORT + '/contents/:owner/:repo/:branch/*',
      'http://localhost:' + PORT + '/raw/:owner/:repo/:branch/*',
      'http://localhost:' + PORT + '/logs'
    ]
  });
});