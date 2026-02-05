import { useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import ProtectedRoute from './components/ProtectedRoute';
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
import { useUserStore } from './store/userStore';
import ErrorBoundary from './utils/errorBoundary';
import { createLogger, getRuntimeConfig, logger } from './utils/logger';

function App() {
  const {
    selectedRoom,
    selectedActivity,
    setNetworkStatus,
    updateNetworkQuality,
    networkStatus: storeNetworkStatus,
  } = useUserStore();
  const { networkStatus: hookNetworkStatus } = useNetworkStatus();
  const appLogger = useMemo(() => createLogger('App'), []);

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

  // Conditions for protected routes with additional requirements
  // Note: Authentication is handled by ProtectedRoute component
  const hasSelectedRoom = !!selectedRoom;
  const hasActiveSession = !!selectedActivity && !!selectedRoom;

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
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/pin" element={<PinPage />} />

            {/* Protected routes - require authentication */}
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <HomeViewPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tag-assignment"
              element={
                <ProtectedRoute>
                  <TagAssignmentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student-selection"
              element={
                <ProtectedRoute>
                  <StudentSelectionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity-selection"
              element={
                <ProtectedRoute>
                  <CreateActivityPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff-selection"
              element={
                <ProtectedRoute>
                  <StaffSelectionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team-management"
              element={
                <ProtectedRoute>
                  <TeamManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rooms"
              element={
                <ProtectedRoute>
                  <RoomSelectionPage />
                </ProtectedRoute>
              }
            />

            {/* Protected routes with additional conditions */}
            <Route
              path="/nfc-scanning"
              element={
                <ProtectedRoute condition={hasActiveSession}>
                  <ActivityScanningPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-activity"
              element={
                <ProtectedRoute condition={hasSelectedRoom}>
                  <CreateActivityPage />
                </ProtectedRoute>
              }
            />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </main>
    </ErrorBoundary>
  );
}

export default App;
