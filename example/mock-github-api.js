/**
 * Mock GitHub API for browser testing without making actual API requests
 * 
 * This is a simple implementation that intercepts fetch requests to github.com
 * and returns mock responses for testing various scenarios.
 */

// Original fetch function
const originalFetch = window.fetch;

/**
 * Initialize the mock GitHub API
 * @param {Object} options Mock options
 */
export function initMockGitHubApi(options = {}) {
  const defaultOptions = {
    enabled: true,
    mockRateLimitError: false,
    mockAuthError: false,
    mockNetworkError: false,
    mockServerError: false,
    mockRepoNotFound: false,
    mockSuccessfulRepo: true,
    remainingRateLimit: 60,
    resetTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  const settings = { ...defaultOptions, ...options };
  
  if (!settings.enabled) {
    // Restore original fetch if mock is disabled
    window.fetch = originalFetch;
    console.log('Mock GitHub API disabled, using original fetch');
    return;
  }

  // Override fetch
  window.fetch = async function(url, options) {
    // Only intercept GitHub API requests
    if (typeof url === 'string' && url.includes('api.github.com')) {
      console.log(`Mock GitHub API intercepted request to: ${url}`);
      
      // Extract repo info from URL
      let owner, repo, path;
      try {
        const match = url.match(/\/repos\/([^\/]+)\/([^\/]+)(?:\/contents\/(.*))?/);
        if (match) {
          [, owner, repo, path] = match;
          path = path || '';
        }
      } catch (e) {
        console.error('Error parsing GitHub URL:', e);
      }
      
      // Simulate network error
      if (settings.mockNetworkError) {
        throw new Error('Network error: Failed to fetch');
      }
      
      // Create response headers
      const headers = new Headers({
        'content-type': 'application/json',
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': settings.remainingRateLimit.toString(),
        'x-ratelimit-reset': settings.resetTime.toString(),
      });
      
      // Simulate rate limit error
      if (settings.mockRateLimitError) {
        return new Response(
          JSON.stringify({
            message: 'API rate limit exceeded for your IP (60 requests per hour).',
            documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting'
          }),
          { 
            status: 403, 
            headers,
          }
        );
      }
      
      // Simulate authentication error
      if (settings.mockAuthError) {
        return new Response(
          JSON.stringify({
            message: 'Bad credentials',
            documentation_url: 'https://docs.github.com/rest'
          }),
          { status: 401, headers }
        );
      }
      
      // Simulate server error
      if (settings.mockServerError) {
        return new Response(
          JSON.stringify({
            message: 'Server Error'
          }),
          { status: 500, headers }
        );
      }
      
      // Simulate repo not found
      if (settings.mockRepoNotFound) {
        return new Response(
          JSON.stringify({
            message: 'Not Found',
            documentation_url: 'https://docs.github.com/rest/reference/repos#get-a-repository'
          }),
          { status: 404, headers }
        );
      }
      
      // Return successful response with mock data
      if (settings.mockSuccessfulRepo) {
        // Check if this is a repo info request or contents request
        if (url.includes('/contents/')) {
          // Mock directory contents
          return new Response(
            JSON.stringify([
              {
                name: 'README.md',
                path: `${path ? path + '/' : ''}README.md`,
                sha: 'mock-sha-1',
                size: 1024,
                url: `https://api.github.com/repos/${owner}/${repo}/contents/README.md`,
                html_url: `https://github.com/${owner}/${repo}/blob/main/README.md`,
                git_url: `https://api.github.com/repos/${owner}/${repo}/git/blobs/mock-sha-1`,
                download_url: `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
                type: 'file',
              },
              {
                name: 'src',
                path: `${path ? path + '/' : ''}src`,
                sha: 'mock-sha-2',
                size: 0,
                url: `https://api.github.com/repos/${owner}/${repo}/contents/src`,
                html_url: `https://github.com/${owner}/${repo}/tree/main/src`,
                git_url: `https://api.github.com/repos/${owner}/${repo}/git/trees/mock-sha-2`,
                download_url: null,
                type: 'dir',
              }
            ]),
            { status: 200, headers }
          );
        } else if (url.includes('/repos/') && !url.includes('/contents')) {
          // Mock repository info
          return new Response(
            JSON.stringify({
              id: 123456789,
              name: repo,
              full_name: `${owner}/${repo}`,
              private: false,
              html_url: `https://github.com/${owner}/${repo}`,
              description: 'A mock repository for testing',
              url: `https://api.github.com/repos/${owner}/${repo}`,
              size: 1024,
              stargazers_count: 42,
              watchers_count: 42,
              language: 'JavaScript',
              has_issues: true,
              has_projects: true,
              has_downloads: true,
              has_wiki: true,
              has_pages: false,
              forks_count: 13,
              archived: false,
              disabled: false,
              open_issues_count: 5,
              license: {
                key: 'mit',
                name: 'MIT License',
                url: 'https://api.github.com/licenses/mit',
              },
              visibility: 'public',
              default_branch: 'main',
            }),
            { status: 200, headers }
          );
        } else if (url.includes('raw.githubusercontent.com') || url.includes('download_url')) {
          // Mock file content
          return new Response(
            'This is mock file content for testing.\n\nThe repo-combiner tool is working correctly!',
            { 
              status: 200, 
              headers: new Headers({
                'content-type': 'text/plain',
              }) 
            }
          );
        }
      }
    }
    
    // Pass through to original fetch for non-GitHub requests
    return originalFetch(url, options);
  };
  
  console.log('Mock GitHub API initialized with settings:', settings);
}

/**
 * Restore the original fetch function
 */
export function restoreFetch() {
  window.fetch = originalFetch;
  console.log('Restored original fetch function');
}