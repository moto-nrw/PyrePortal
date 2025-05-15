import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import CheckInOutPage from './pages/CheckInOutPage';
import CreateActivityPage from './pages/CreateActivityPage';
import LoginPage from './pages/LoginPage';
import PinPage from './pages/PinPage';
import RoomSelectionPage from './pages/RoomSelectionPage';
import { useUserStore } from './store/userStore';
import ErrorBoundary from './utils/errorBoundary';
import { createLogger, logger } from './utils/logger';
import { getRuntimeConfig } from './utils/loggerConfig';

function App() {
  const { selectedUser, selectedRoom, activities } = useUserStore();
  const appLogger = createLogger('App');

  // Initialize logger with runtime config
  useEffect(() => {
    const config = getRuntimeConfig();
    logger.updateConfig(config);
    appLogger.info('Application initialized', {
      version: (import.meta.env.VITE_APP_VERSION as string) ?? 'dev',
      environment: import.meta.env.MODE,
    });
  }, [appLogger]);

  // Simple auth check for protected routes
  const isAuthenticated = !!selectedUser;

  // Check if a room is selected for the activity creation page
  const hasSelectedRoom = !!selectedRoom;

  // Check if there are activities for the check-in-out page
  const hasActivity = isAuthenticated && (!!selectedRoom || activities.length > 0);

  return (
    <ErrorBoundary>
      <main className="relative z-[1] m-0 flex h-screen flex-col items-center justify-center text-center">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/pin" element={<PinPage />} />
            <Route
              path="/rooms"
              element={isAuthenticated ? <RoomSelectionPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/create-activity"
              element={
                isAuthenticated && hasSelectedRoom ? (
                  <CreateActivityPage />
                ) : (
                  <Navigate to={isAuthenticated ? '/rooms' : '/'} replace />
                )
              }
            />
            <Route
              path="/check-in-out"
              element={
                isAuthenticated && hasActivity ? (
                  <CheckInOutPage />
                ) : (
                  <Navigate to={isAuthenticated ? '/rooms' : '/'} replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </main>
    </ErrorBoundary>
  );
}

export default App;
