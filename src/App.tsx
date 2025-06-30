import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { RfidServiceInitializer } from './components/RfidServiceInitializer';
import ActivityScanningPage from './pages/ActivityScanningPage';
import AttendancePage from './pages/AttendancePage';
import CreateActivityPage from './pages/CreateActivityPage';
import HomeViewPage from './pages/HomeViewPage';
import LandingPage from './pages/LandingPage';
import PinPage from './pages/PinPage';
import RoomSelectionPage from './pages/RoomSelectionPage';
import StaffSelectionPage from './pages/StaffSelectionPage';
import TagAssignmentPage from './pages/TagAssignmentPage';
import UserSelectionPage from './pages/UserSelectionPage';
import { initializeApi } from './services/api';
import { useUserStore } from './store/userStore';
import ErrorBoundary from './utils/errorBoundary';
import { createLogger, logger } from './utils/logger';
import { getRuntimeConfig } from './utils/loggerConfig';

function App() {
  const { authenticatedUser, selectedRoom, selectedActivity } = useUserStore();
  const appLogger = createLogger('App');

  // Initialize logger with runtime config and API
  useEffect(() => {
    const initApp = async () => {
      // Initialize logger
      const config = getRuntimeConfig();
      logger.updateConfig(config);
      
      // Initialize API configuration
      try {
        await initializeApi();
        appLogger.info('API configuration loaded successfully');
      } catch (error) {
        appLogger.error('Failed to initialize API configuration', { error });
      }
      
      appLogger.info('Application initialized', {
        version: (import.meta.env.VITE_APP_VERSION as string) ?? 'dev',
        environment: import.meta.env.MODE,
      });
    };
    
    void initApp();
  }, [appLogger]); // Include appLogger in dependency array

  // Auth states
  const isFullyAuthenticated = !!authenticatedUser; // PIN validated, fully authenticated

  // Check if a room is selected for the activity creation page
  const hasSelectedRoom = !!selectedRoom;

  // Check if session is active (has activity, room, and authenticated user)
  const hasActiveSession = isFullyAuthenticated && !!selectedActivity && !!selectedRoom;

  return (
    <ErrorBoundary>
      <RfidServiceInitializer />
      <main className="relative z-[1] m-0 flex h-screen flex-col items-center justify-center text-center">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/user-selection" element={<UserSelectionPage />} />
            <Route
              path="/pin"
              element={<PinPage />}
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
              path="/staff-selection"
              element={isFullyAuthenticated ? <StaffSelectionPage /> : <Navigate to="/" replace />}
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
              path="/attendance"
              element={isFullyAuthenticated ? <AttendancePage /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </main>
    </ErrorBoundary>
  );
}

export default App;
