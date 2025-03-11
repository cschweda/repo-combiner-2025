// Import Svelte app component
import App from './App.js';

// Mount Svelte app using the correct approach
const app = new App({
  target: document.getElementById('app'),
});

export default app;
