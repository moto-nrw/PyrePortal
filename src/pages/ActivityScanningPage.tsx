import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [studentCount, setStudentCount] = useState(selectedActivity?.enrollment_count || 0);
  
  // Update student count when a new scan occurs
  useEffect(() => {
    if (currentScan) {
      if (currentScan.action === 'checked_in') {
        setStudentCount(prev => prev + 1);
      } else if (currentScan.action === 'checked_out' && studentCount > 0) {
        setStudentCount(prev => Math.max(0, prev - 1));
      }
    }
  }, [currentScan, studentCount]);

  return (
    <>
      <ContentBox centered shadow="md" rounded="lg">
        <div style={{ width: '100%', maxWidth: '800px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Fixed Header */}
          <div style={{ flexShrink: 0 }}>
            {/* Navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <Button onClick={() => navigate('/home')} variant="outline" size="medium">
                ← Zurück
              </Button>
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
                {studentCount} Schüler anwesend
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
          <div className="text-center">
            <div className="text-4xl mb-4">
              {currentScan.action === 'checked_in' ? '✅' : '👋'}
            </div>
            <h3 className="text-2xl font-bold mb-2">
              {currentScan.message || 
                (currentScan.action === 'checked_in' 
                  ? `Hallo, ${currentScan.student_name}!` 
                  : `Tschüss, ${currentScan.student_name}!`
                )
              }
            </h3>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ActivityScanningPage;