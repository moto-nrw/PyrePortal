import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../services/api';
import { Button, ContentBox } from '../components/ui';
import { useRfidScanning } from '../hooks/useRfidScanning';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger } from '../utils/logger';

const logger = createLogger('ActivityScanningPage');

const ActivityScanningPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedActivity,
    selectedRoom,
    authenticatedUser,
    rfid,
  } = useUserStore();
  
  const {
    isScanning,
    currentScan,
    showModal,
    startScanning,
    stopScanning,
  } = useRfidScanning();
  
  // Debug logging for modal state
  useEffect(() => {
    if (showModal && currentScan) {
      logger.info('Modal should be showing', { 
        showModal, 
        studentName: currentScan.student_name,
        action: currentScan.action 
      });
      
      // Additional debug logging
      console.log('🎯 Modal rendering with currentScan:', {
        action: currentScan.action,
        actionCheck: currentScan.action === 'checked_in',
        studentName: currentScan.student_name,
        message: currentScan.message,
        fullScan: currentScan
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
      const sessionInfo = await api.getCurrentSessionInfo(authenticatedUser.pin);
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
    
    // Set up periodic updates every 5 seconds
    const interval = setInterval(() => {
      void fetchSessionInfo();
    }, 5000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticatedUser?.pin]); // fetchSessionInfo is stable within this component lifecycle
  
  // Also update immediately after a scan
  useEffect(() => {
    if (currentScan && showModal) {
      // Delay slightly to ensure server has processed the scan
      setTimeout(() => {
        void fetchSessionInfo();
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScan, showModal]); // fetchSessionInfo is stable within this component lifecycle

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
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-600">Keine Aktivität ausgewählt</p>
          <button
            onClick={() => navigate('/home')}
            className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
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
        <div style={{ width: '100%', maxWidth: '800px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Fixed Header */}
          <div style={{ flexShrink: 0 }}>
            {/* Navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: theme.spacing.lg }}>
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
                Raum: {selectedRoom.name}
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
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
          }}>
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
              {currentScan.action === 'checked_in' ? '✅' : '👋'}
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
                  : `Tschüss, ${currentScan.student_name}!`
                )
              }
            </h2>
            
            <div
              style={{
                fontSize: theme.fonts.size.large,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.xl,
              }}
            >
              {currentScan.action === 'checked_in' 
                ? 'Du bist jetzt angemeldet' 
                : 'Du bist jetzt abgemeldet'
              }
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ActivityScanningPage;