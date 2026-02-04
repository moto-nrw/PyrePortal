// FontAwesome CSS - MUST be imported explicitly for production builds
// Without this, icons display as rectangles/empty boxes
import '@fortawesome/fontawesome-svg-core/styles.css';
import { config } from '@fortawesome/fontawesome-svg-core';
import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css';
import App from './App';
import { initializeApi } from './services/api';
import { createLogger } from './utils/logger';

// Prevent FontAwesome from auto-injecting CSS (we import it manually above)
config.autoAddCss = false;

const logger = createLogger('main');

// Initialize API before rendering to avoid race conditions with network status checks
try {
  await initializeApi();
} catch (error) {
  logger.error('Failed to initialize API', { error });
  // Still render the app even if API init fails - it will show offline status
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
