import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import { useUserStore } from '../store/userStore';
import type { Activity } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logUserAction, logError, logNavigation } from '../utils/logger';

function CheckInOutPage() {
  const { selectedRoom, selectedUser, currentActivity, activities, startNfcScan, stopNfcScan, nfcScanActive } =
    useUserStore();
    
  // Use a ref to track scan state locally to avoid dependency cycles
  const nfcScanRef = useRef(nfcScanActive);
  
  // Simple ref-based state tracker to avoid re-renders
  const get = (key: string) => {
    if (key === 'nfcScanActive') return nfcScanRef.current;
    return null;
  };

  const [scanMessage, setScanMessage] = useState<string>('');
  const [isScanning] = useState<boolean>(true); // Always scanning
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [displayActivity, setDisplayActivity] = useState<Activity | null>(null);
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('CheckInOutPage');

  // Update ref when nfcScanActive changes
  useEffect(() => {
    nfcScanRef.current = nfcScanActive;
  }, [nfcScanActive]);

  // Log component mount/unmount and initialization state
  useEffect(() => {
    logger.debug('CheckInOutPage component mounted', {
      user: selectedUser,
      hasSelectedRoom: !!selectedRoom,
      hasCurrentActivity: !!currentActivity,
    });

    // Check authentication and prerequisites
    if (!selectedUser) {
      logger.warn('Unauthenticated access to CheckInOutPage');
      logNavigation('CheckInOutPage', 'LoginPage', { reason: 'unauthenticated' });
      void navigate('/');
      return;
    }

    if (!selectedRoom) {
      logger.warn('CheckInOutPage accessed without selected room');
      logNavigation('CheckInOutPage', 'RoomSelectionPage', { reason: 'no_room_selected' });
      void navigate('/rooms');
      return;
    }

    if (!currentActivity && activities.length === 0) {
      logger.warn('CheckInOutPage accessed without an activity');
      logNavigation('CheckInOutPage', 'CreateActivityPage', { reason: 'no_activity' });
      void navigate('/create-activity');
      return;
    }

    return () => {
      // Only log the unmount, NFC scan cleanup is handled in the NFC-specific effect
      logger.debug('CheckInOutPage component unmounted');
    };
  // Excluding logger to prevent infinite loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, selectedRoom, currentActivity, navigate, activities.length]);

  // Simulate a successful NFC scan - memoized to avoid recreation
  const simulateNfcScan = useCallback(async () => {
    // Early return if not scanning
    if (!isScanning) return;

    try {
      const scanTime = new Date();
      setLastScanTime(scanTime);

      // Get fake student names for simulation
      const studentNames = [
        'Max Mustermann',
        'Anna Schmidt',
        'Leon Weber',
        'Sophie Fischer',
        'Tim Becker',
        'Lena Hoffmann',
      ];
      const randomName = studentNames[Math.floor(Math.random() * studentNames.length)];
      const randomAction = Math.random() > 0.5 ? 'eingecheckt' : 'ausgecheckt';

      // Use a local logger reference to break circular dependencies
      const eventId = Math.random().toString(36).substr(2, 9);
      
      // Log but don't include in deps
      logger.info('NFC scan detected', { 
        studentName: randomName, 
        eventId,
        timestamp: scanTime.toISOString() 
      });

      // Simulate checking in/out
      setScanMessage(`${randomName} erfolgreich ${randomAction}!`);
      logUserAction(`student_${randomAction === 'eingecheckt' ? 'checked_in' : 'checked_out'}`, {
        studentName: randomName,
        eventId
      });

      // Reset message after 3 seconds
      setTimeout(() => {
        if (isScanning) {
          setScanMessage('NFC-Scan läuft. Bitte Karte an Scanner halten...');
        }
      }, 3000);
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CheckInOutPage.simulateNfcScan'
      );
    }
  // Excluding logger from deps to avoid infinite loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  // Start NFC scanning automatically when component mounts - only runs once on mount
  useEffect(() => {
    const scanId = Math.random().toString(36).substring(7); // Generate unique ID for this scan session
    
    try {
      if (!get('nfcScanActive')) { // Track the scan state in a ref to avoid extra renders
        logger.info('Starting NFC scan automatically', { scanId });
        setScanMessage('NFC-Scan läuft. Bitte Karte an Scanner halten...');
        startNfcScan();
        logUserAction('nfc_scan_started', { scanId });
      }

      // For demo purposes, simulate a scan after 3 seconds
      const interval = setInterval(() => {
        void simulateNfcScan();
      }, 8000); // Run every 8 seconds

      // Cleanup function
      return () => {
        logger.debug('Cleaning up NFC scan effect', { scanId });
        clearInterval(interval);
        
        // Only stop if we're the ones who started it
        stopNfcScan();
        logger.debug('NFC scan stopped and interval cleared', { scanId });
      };
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CheckInOutPage.autoStartScan'
      );
    }
  // We deliberately exclude functions from deps to prevent re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update displayActivity when component mounts or dependencies change
  useEffect(() => {
    // Get the most recent activity from the array
    const mostRecentActivity = activities.length > 0 ? activities[activities.length - 1] : null;
    
    // This is the critical fix to the issue - explicitly use the array-based activity
    // Ignore currentActivity since it becomes null after creation
    if (mostRecentActivity) {
      logger.debug('Using most recent activity from array', {
        mostRecentActivity,
        activityName: mostRecentActivity.name
      });
      
      // Only set if there's a valid activity
      setDisplayActivity(mostRecentActivity);
    } else {
      setDisplayActivity(null);
    }
  }, [activities, activities.length, logger]);

  return (
    <ContentBox shadow="md" rounded="lg" height="95%" centered={true}>
      <div className="flex flex-col items-center justify-center">
        {/* Activity and Room Info */}
        {displayActivity && selectedRoom && (
          <div className="mb-10 text-center">
            <h1
              style={{
                fontSize: theme.fonts.size.xxl,
                fontWeight: theme.fonts.weight.bold,
                marginBottom: theme.spacing.md,
                color: theme.colors.primary,
              }}
            >
              {displayActivity.name || 'Unnamed Activity'}
            </h1>
            <p
              style={{
                fontSize: theme.fonts.size.xl,
                color: theme.colors.secondary,
                fontWeight: theme.fonts.weight.medium,
              }}
            >
              {selectedRoom.name}
            </p>
          </div>
        )}

        {/* NFC Scanning Symbol */}
        <div className="flex flex-col items-center">
          <div className="mb-6 h-40 w-40">
            <img
              src="/img/placeholder_nfc_scan_transparent.png"
              alt="NFC Scanner"
              className="h-full w-full animate-pulse object-contain transition-all duration-500"
            />
          </div>

          <div className="text-center">
            <p
              style={{
                fontSize: theme.fonts.size.large,
                color: theme.colors.text.secondary,
              }}
            >
              {scanMessage ?? 'NFC-Scan läuft. Bitte Karte an Scanner halten...'}
            </p>
            {lastScanTime && (
              <p className="mt-3 text-sm text-gray-500">
                Letzter Scan: {lastScanTime.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </ContentBox>
  );
}

export default CheckInOutPage;