import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox, Modal } from '../components/ui';
import { useRfidScanning } from '../hooks/useRfidScanning';
import { useUserStore } from '../store/userStore';
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

  const handleEndActivity = () => {
    stopScanning();
    // TODO: Call API to end session
    void navigate('/');
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
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            {selectedActivity.name}
          </h1>
          <p className="text-lg text-gray-600">
            Raum: {selectedRoom.name}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {studentCount}
            </div>
            <div className="text-sm text-gray-600">
              Schüler
            </div>
          </div>
          
          <Button
            onClick={handleAnmelden}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            Anmelden
          </Button>
        </div>
      </div>

      {/* Main scanning area */}
      <ContentBox className="flex flex-col items-center justify-center min-h-[400px] mb-8">
        <div className="text-center">
          <div className="text-6xl mb-4">
            {isScanning ? '📡' : '⏸️'}
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">
            {isScanning ? 'RFID Scanner Aktiv' : 'Scanner Pausiert'}
          </h2>
          <p className="text-lg text-gray-600">
            {isScanning ? 'Schülerkarte hier scannen' : 'Scanner ist pausiert'}
          </p>
        </div>
      </ContentBox>

      {/* End activity button */}
      <div className="flex justify-center">
        <Button
          onClick={handleEndActivity}
          className="bg-red-500 hover:bg-red-600 text-white px-8 py-3"
        >
          Aktivität Beenden
        </Button>
      </div>

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
    </div>
  );
};

export default ActivityScanningPage;