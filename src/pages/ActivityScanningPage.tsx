import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../services/api';
import { Button, ContentBox, Modal } from '../components/ui';
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

  // Start scanning when component mounts
  useEffect(() => {
    logger.info('Activity Scanning Page mounted, starting RFID scanning');
    startScanning();
    
    // Cleanup: stop scanning when component unmounts
    return () => {
      logger.info('Activity Scanning Page unmounting, stopping RFID scanning');
      stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

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
    stopScanning();
    // Navigate to PIN page for teacher access
    void navigate('/pin');
  };

  // Track student count based on check-ins
  const [studentCount, setStudentCount] = useState(0);
  
  // Function to fetch current session info
  const fetchSessionInfo = async () => {
    if (!authenticatedUser?.pin) return;
    
    try {
      const sessionInfo = await api.getCurrentSessionInfo(authenticatedUser.pin);
      logger.debug('Session info received:', sessionInfo || {});
      
      if (sessionInfo) {
        const count = sessionInfo.active_students || 0;
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
                <span>{studentCount !== null && studentCount !== undefined ? studentCount : 0}</span>
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
      <Modal
        isOpen={showModal}
        onClose={() => { /* Auto-close handled by autoCloseDelay */ }}
        autoCloseDelay={rfid.modalDisplayTime}
        type={currentScan?.action === 'checked_in' ? 'success' : 'info'}
      >
        {currentScan && (
          <div className="text-center py-8">
            <div className="text-8xl mb-8">
              {currentScan.action === 'checked_in' ? '✅' : '👋'}
            </div>
            <h3 className="text-4xl font-bold mb-4">
              {currentScan.message || 
                (currentScan.action === 'checked_in' 
                  ? `Hallo, ${currentScan.student_name}!` 
                  : `Tschüss, ${currentScan.student_name}!`
                )
              }
            </h3>
            <p className="text-2xl text-gray-600">
              {currentScan.action === 'checked_in' 
                ? 'Du bist jetzt angemeldet' 
                : 'Du bist jetzt abgemeldet'
              }
            </p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ActivityScanningPage;