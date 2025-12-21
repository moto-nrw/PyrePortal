import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { RfidServiceInitializer } from './components/RfidServiceInitializer';
import NetworkStatus from './components/ui/NetworkStatus';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import ActivityScanningPage from './pages/ActivityScanningPage';
import CreateActivityPage from './pages/CreateActivityPage';
import HomeViewPage from './pages/HomeViewPage';
import LandingPage from './pages/LandingPage';
import PinPage from './pages/PinPage';
import RoomSelectionPage from './pages/RoomSelectionPage';
import StaffSelectionPage from './pages/StaffSelectionPage';
import StudentSelectionPage from './pages/StudentSelectionPage';
import TagAssignmentPage from './pages/TagAssignmentPage';
import TeamManagementPage from './pages/TeamManagementPage';
import { setNetworkStatusCallback } from './services/api';
import { startAutoSync } from './services/syncQueue';
import { useUserStore } from './store/userStore';
import ErrorBoundary from './utils/errorBoundary';
import { createLogger, logger } from './utils/logger';
import { getRuntimeConfig } from './utils/loggerConfig';

function App() {
  const {
    authenticatedUser,
    selectedRoom,
    selectedActivity,
    setNetworkStatus,
    updateNetworkQuality,
    networkStatus: storeNetworkStatus,
  } = useUserStore();
  const { networkStatus: hookNetworkStatus } = useNetworkStatus();
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

  // Sync network status from hook to store (for periodic health checks)
  useEffect(() => {
    setNetworkStatus(hookNetworkStatus);
  }, [hookNetworkStatus, setNetworkStatus]);

  // Register API callback to update network status on every API call
  useEffect(() => {
    setNetworkStatusCallback(updateNetworkQuality);
    return () => setNetworkStatusCallback(null);
  }, [updateNetworkQuality]);

  // Start automatic sync queue processing for offline operations
  useEffect(() => {
    appLogger.info('Starting automatic sync queue processing');
    const stopAutoSync = startAutoSync(30000); // Check every 30 seconds

    // Cleanup on unmount
    return () => {
      appLogger.info('Stopping automatic sync queue processing');
      stopAutoSync();
    };
  }, [appLogger]);

  // Auth states
  const isFullyAuthenticated = !!authenticatedUser; // PIN validated, fully authenticated

  // Check if a room is selected for the activity creation page
  const hasSelectedRoom = !!selectedRoom;

  // Check if session is active (has activity, room, and authenticated user)
  const hasActiveSession = isFullyAuthenticated && !!selectedActivity && !!selectedRoom;

  return (
    <ErrorBoundary>
      <RfidServiceInitializer />
      {/* Network Status Indicator - shown on all pages when poor/offline */}
      {(storeNetworkStatus.quality === 'poor' || storeNetworkStatus.quality === 'offline') && (
        <div
          style={{
            position: 'fixed',
            bottom: '8px',
            right: '8px',
            zIndex: 1000,
            pointerEvents: 'none', // Doesn't interfere with interactions
          }}
        >
          <NetworkStatus status={storeNetworkStatus} />
        </div>
      )}
      <main className="relative z-[1] m-0 flex h-screen flex-col items-center justify-center text-center">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/pin" element={<PinPage />} />
            <Route
              path="/home"
              element={isFullyAuthenticated ? <HomeViewPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/tag-assignment"
              element={isFullyAuthenticated ? <TagAssignmentPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/student-selection"
              element={
                isFullyAuthenticated ? <StudentSelectionPage /> : <Navigate to="/" replace />
              }
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
              path="/team-management"
              element={isFullyAuthenticated ? <TeamManagementPage /> : <Navigate to="/" replace />}
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </main>
    </ErrorBoundary>
  );
}

export default App;
