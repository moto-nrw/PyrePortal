// FontAwesome CSS - MUST be imported explicitly for production builds
// Without this, icons display as rectangles/empty boxes
import '@fortawesome/fontawesome-svg-core/styles.css';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-sans/800.css';
import { config } from '@fortawesome/fontawesome-svg-core';
import { reactErrorHandler } from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css';
import App from './App';
import { fetchSchoolName, initializeApi } from './services/api';
import { initErrorReporting } from './services/errorReporting';
import { createLogger, serializeError } from './utils/logger';

// Prevent FontAwesome from auto-injecting CSS (we import it manually above)
config.autoAddCss = false;

const logger = createLogger('main');

// Before the API so startup failures are reported too
const errorReportingEnabled = initErrorReporting();

// Initialize API before rendering to avoid race conditions with network status checks
try {
  await initializeApi();
  // Best-effort: fetch school name for landing page display (non-blocking)
  void fetchSchoolName();
} catch (error) {
  logger.error('Failed to initialize API', { error: serializeError(error) });
  // Still render the app even if API init fails - it will show offline status
}

// Without Sentry, keep React's default error logging
const rootOptions = errorReportingEnabled
  ? {
      onUncaughtError: reactErrorHandler(),
      onCaughtError: reactErrorHandler(),
      onRecoverableError: reactErrorHandler(),
    }
  : {};

ReactDOM.createRoot(document.getElementById('root')!, rootOptions).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
