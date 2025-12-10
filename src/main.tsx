import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css';
import App from './App';
import { initializeApi } from './services/api';
import { createLogger } from './utils/logger';

const logger = createLogger('main');

// Initialize API before rendering to avoid race conditions with network status checks
initializeApi()
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch(error => {
    logger.error('Failed to initialize API:', { error });
    // Still render the app even if API init fails - it will show offline status
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
