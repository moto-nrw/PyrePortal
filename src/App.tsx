import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import ActivityScanningPage from './pages/ActivityScanningPage';
import CreateActivityPage from './pages/CreateActivityPage';
import HomeViewPage from './pages/HomeViewPage';
import LoginPage from './pages/LoginPage';
import PinPage from './pages/PinPage';
import RoomSelectionPage from './pages/RoomSelectionPage';
import TagAssignmentPage from './pages/TagAssignmentPage';
import { useUserStore } from './store/userStore';
import ErrorBoundary from './utils/errorBoundary';
import { createLogger, logger } from './utils/logger';
import { getRuntimeConfig } from './utils/loggerConfig';

function App() {
  const { selectedUser, authenticatedUser, selectedRoom, selectedActivity } = useUserStore();
  const appLogger = createLogger('App');

  // Initialize logger with runtime config
  useEffect(() => {
    const config = getRuntimeConfig();
    logger.updateConfig(config);
    appLogger.info('Application initialized', {
      version: (import.meta.env.VITE_APP_VERSION as string) ?? 'dev',
      environment: import.meta.env.MODE,
    });
  }, [appLogger]); // Include appLogger in dependency array

  // Auth states
  const hasSelectedUser = !!selectedUser; // Teacher selected, need PIN
  const isFullyAuthenticated = !!authenticatedUser; // PIN validated, fully authenticated

  // Check if a room is selected for the activity creation page
  const hasSelectedRoom = !!selectedRoom;

  // Check if session is active (has activity, room, and authenticated user)
  const hasActiveSession = isFullyAuthenticated && !!selectedActivity && !!selectedRoom;

  return (
    <ErrorBoundary>
      <main className="relative z-[1] m-0 flex h-screen flex-col items-center justify-center text-center">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route
              path="/pin"
              element={hasSelectedUser ? <PinPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/home"
              element={isFullyAuthenticated ? <HomeViewPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/tag-assignment"
              element={isFullyAuthenticated ? <TagAssignmentPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/activity-selection"
              element={isFullyAuthenticated ? <CreateActivityPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/rooms"
              element={isFullyAuthenticated ? <RoomSelectionPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/nfc-scanning"
              element={
                hasActiveSession ? (
                  <ActivityScanningPage />
                ) : (
                  <Navigate to={isFullyAuthenticated ? '/home' : '/'} replace />
                )
              }
            />
            <Route
              path="/create-activity"
              element={
                isFullyAuthenticated && hasSelectedRoom ? (
                  <CreateActivityPage />
                ) : (
                  <Navigate to={isFullyAuthenticated ? '/home' : '/'} replace />
                )
              }
            />
            <Route
              path="/log-off-student"
              element={isFullyAuthenticated ? <div>Log Off Student Page</div> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </main>
    </ErrorBoundary>
  );
}

export default App;
