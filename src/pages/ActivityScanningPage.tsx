import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox } from '../components/ui';
import { useRfidScanning } from '../hooks/useRfidScanning';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger } from '../utils/logger';

const logger = createLogger('ActivityScanningPage');

const ActivityScanningPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedActivity, selectedRoom, authenticatedUser, rfid } = useUserStore();

  const { isScanning, currentScan, showModal, startScanning, stopScanning } = useRfidScanning();

  // Debug logging for modal state
  useEffect(() => {
    if (showModal && currentScan) {
      logger.info('Modal should be showing', {
        showModal,
        studentName: currentScan.student_name,
        action: currentScan.action,
      });

      // Additional debug logging
      logger.debug('Modal rendering with currentScan', {
        action: currentScan.action,
        actionCheck: currentScan.action === 'checked_in',
        studentName: currentScan.student_name,
        message: currentScan.message,
        fullScan: currentScan,
      });
    }
  }, [showModal, currentScan]);

  // Track student count based on check-ins
  const [studentCount, setStudentCount] = useState(0);

  // Start scanning when component mounts
  useEffect(() => {
    logger.info('Activity Scanning Page mounted, starting RFID scanning');
    void startScanning(); // Handle async function

    // Cleanup: stop scanning when component unmounts
    return () => {
      logger.info('Activity Scanning Page unmounting, stopping RFID scanning');
      void stopScanning(); // Handle async function
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  // Function to fetch current session info
  const fetchSessionInfo = async () => {
    if (!authenticatedUser?.pin) return;

    try {
      const sessionInfo = await api.getCurrentSessionInfo(authenticatedUser.pin, authenticatedUser.staffId);
      logger.debug('Session info received:', sessionInfo ?? {});

      if (sessionInfo) {
        const count = sessionInfo.active_students ?? 0;
        logger.info(`Setting student count to: ${count}`);
        setStudentCount(count);
      } else {
        logger.warn('No session info received');
        setStudentCount(0);
      }
    } catch (error) {
      logger.error('Failed to fetch session info', { error });
    }
  };

  // Initialize and periodically update student count
  useEffect(() => {
    // Initial fetch
    void fetchSessionInfo();

    // Set up periodic updates every 30 seconds (just for sync)
    const interval = setInterval(() => {
      void fetchSessionInfo();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticatedUser?.pin]); // fetchSessionInfo is stable within this component lifecycle

  // Update student count based on scan result
  useEffect(() => {
    if (currentScan && showModal) {
      // Instead of fetching, update count based on scan action
      logger.debug('Updating student count based on scan', { 
        action: currentScan.action,
        currentCount: studentCount 
      });
      
      if (currentScan.action === 'checked_in') {
        setStudentCount(prev => prev + 1);
      } else if (currentScan.action === 'checked_out') {
        setStudentCount(prev => Math.max(0, prev - 1));
      } else if (currentScan.action === 'transferred') {
        // For transfers, check if student is coming to or leaving our room
        const currentRoomName = selectedRoom?.name;
        if (currentScan.room_name === currentRoomName) {
          // Student transferred TO our room from another room
          setStudentCount(prev => prev + 1);
        } else if (currentScan.previous_room === currentRoomName) {
          // Student transferred FROM our room to another room
          setStudentCount(prev => Math.max(0, prev - 1));
        }
        // If neither matches, don't change count (shouldn't happen)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScan, showModal]); // Only update when scan modal shows

  // Auto-close modal after delay
  useEffect(() => {
    if (showModal) {
      const timer = setTimeout(() => {
        // Modal will auto-close through the hook
      }, rfid.modalDisplayTime);
      return () => clearTimeout(timer);
    }
  }, [showModal, rfid.modalDisplayTime]);

  // Guard clause - if data is missing, show loading or error state
  if (!selectedActivity || !selectedRoom || !authenticatedUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="text-center">
          <p className="text-lg text-gray-600">Keine Aktivität ausgewählt</p>
          <button
            onClick={() => navigate('/home')}
            className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Zurück zur Startseite
          </button>
        </div>
      </div>
    );
  }

  const handleAnmelden = () => {
    // Stop scanning temporarily
    void stopScanning(); // Handle async function
    // Navigate to PIN page for teacher access
    void navigate('/pin');
  };

  return (
    <>
      <ContentBox centered shadow="md" rounded="lg">
        <div
          style={{
            width: '100%',
            maxWidth: '800px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Fixed Header */}
          <div style={{ flexShrink: 0 }}>
            {/* Navigation buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                marginBottom: theme.spacing.lg,
              }}
            >
              <Button onClick={handleAnmelden} variant="outline" size="small">
                Anmelden
              </Button>
            </div>

            {/* Title and info */}
            <div style={{ textAlign: 'center', marginBottom: theme.spacing.lg }}>
              <h1
                style={{
                  fontSize: theme.fonts.size.xxl,
                  fontWeight: theme.fonts.weight.bold,
                  marginBottom: theme.spacing.md,
                  color: theme.colors.text.primary,
                }}
              >
                {selectedActivity.name}
              </h1>

              <p
                style={{
                  fontSize: theme.fonts.size.large,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.sm,
                }}
              >
                Raum: {selectedRoom?.name || 'Unbekannt'}
              </p>

              <div
                style={{
                  fontSize: theme.fonts.size.xxl,
                  fontWeight: theme.fonts.weight.bold,
                  color: theme.colors.primary,
                }}
              >
                <span>{studentCount ?? 0}</span>
                <span> Schüler anwesend</span>
              </div>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '5rem', marginBottom: theme.spacing.lg }}>
                {isScanning ? '📡' : '⏸️'}
              </div>
              <h2
                style={{
                  fontSize: theme.fonts.size.xl,
                  fontWeight: theme.fonts.weight.semibold,
                  marginBottom: theme.spacing.md,
                  color: theme.colors.text.primary,
                }}
              >
                {isScanning ? 'RFID Scanner Aktiv' : 'Scanner Pausiert'}
              </h2>
              <p
                style={{
                  fontSize: theme.fonts.size.large,
                  color: theme.colors.text.secondary,
                }}
              >
                {isScanning ? 'Schülerkarte hier scannen' : 'Scanner ist pausiert'}
              </p>
            </div>
          </div>
        </div>
      </ContentBox>

      {/* Check-in/Check-out Modal */}
      {showModal && currentScan && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: theme.colors.background.light,
              borderRadius: theme.borders.radius.lg,
              padding: theme.spacing.xxl,
              maxWidth: '500px',
              width: '90%',
              textAlign: 'center',
              boxShadow: theme.shadows.lg,
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: theme.spacing.lg }}>
              {(() => {
                logger.debug('Modal icon logic:', {
                  action: currentScan.action,
                  isCheckedIn: currentScan.action === 'checked_in',
                  typeOfAction: typeof currentScan.action,
                });
                // Show checkmark for both check-in and transfer (since transfer includes a check-in)
                return currentScan.action === 'checked_in' || currentScan.action === 'transferred' ? '✅' : '👋';
              })()}
            </div>

            <h2
              style={{
                fontSize: theme.fonts.size.xl,
                fontWeight: theme.fonts.weight.bold,
                marginBottom: theme.spacing.lg,
                color: theme.colors.text.primary,
              }}
            >
              {currentScan.message ??
                (currentScan.action === 'checked_in'
                  ? `Hallo, ${currentScan.student_name}!`
                  : `Tschüss, ${currentScan.student_name}!`)}
            </h2>

            <div
              style={{
                fontSize: theme.fonts.size.large,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.xl,
              }}
            >
              {(() => {
                logger.debug('Modal message logic:', {
                  action: currentScan.action,
                  isCheckedIn: currentScan.action === 'checked_in',
                });
                // Show appropriate message based on action
                switch (currentScan.action) {
                  case 'checked_in':
                    return `Du bist jetzt in ${currentScan.room_name ?? 'diesem Raum'} eingecheckt`;
                  case 'checked_out':
                    return 'Du bist jetzt ausgecheckt';
                  case 'transferred':
                    // For transfers, the greeting already contains the transfer info
                    return 'Raumwechsel erfolgreich';
                  default:
                    return '';
                }
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ActivityScanningPage;
