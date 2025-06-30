import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ContentBox } from '../components/ui';
import { api, type Room, type SessionStartRequest, type ActivityResponse } from '../services/api';
import { useUserStore } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

const ROOMS_PER_PAGE = 10; // 5x2 grid to match activity page

interface ConfirmationModalProps {
  isOpen: boolean;
  activity: ActivityResponse | null;
  room: Room;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

interface ConflictModalProps {
  isOpen: boolean;
  activity: ActivityResponse | null;
  room: Room;
  onForceStart: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  activity,
  room,
  onConfirm,
  onCancel,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          padding: '32px',
          maxWidth: '480px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Header Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(to right, #83cd2d, #6ba529)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            boxShadow: '0 8px 32px rgba(131, 205, 45, 0.3)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
        </div>

        <h2
          style={{
            fontSize: '28px',
            fontWeight: 700,
            marginBottom: '16px',
            color: '#1F2937',
            lineHeight: 1.2,
          }}
        >
          Aktivität starten?
        </h2>

        <p
          style={{
            fontSize: '16px',
            color: '#6B7280',
            marginBottom: '32px',
            lineHeight: 1.5,
          }}
        >
          Sie sind dabei, eine neue Aktivitätssession zu starten.
        </p>

        {/* Activity Details Card */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '32px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div
            style={{
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '12px',
              color: '#1F2937',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {activity?.name}
          </div>
          
          <div
            style={{
              fontSize: '16px',
              color: '#64748B',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87C10" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>
              <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2"/>
              <circle cx="11" cy="12" r="1"/>
            </svg>
            {room.name}
          </div>
          
          {room.room_type && (
            <div
              style={{
                fontSize: '14px',
                color: '#9CA3AF',
                marginBottom: '4px',
              }}
            >
              Typ: {room.room_type}
            </div>
          )}
          
          {room.capacity && (
            <div
              style={{
                fontSize: '14px',
                color: '#9CA3AF',
              }}
            >
              Kapazität: {room.capacity} Plätze
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={{
              flex: 1,
              height: '52px',
              fontSize: '16px',
              fontWeight: 600,
              color: '#6B7280',
              backgroundColor: 'transparent',
              border: '2px solid #E5E7EB',
              borderRadius: '16px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              opacity: isLoading ? 0.6 : 1,
            }}
            onTouchStart={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = '#F9FAFB';
                e.currentTarget.style.borderColor = '#D1D5DB';
              }
            }}
            onTouchEnd={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = '#E5E7EB';
              }
            }}
          >
            Abbrechen
          </button>
          
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              flex: 1,
              height: '52px',
              fontSize: '16px',
              fontWeight: 600,
              color: '#FFFFFF',
              background: isLoading 
                ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                : 'linear-gradient(to right, #83cd2d, #6ba529)',
              border: 'none',
              borderRadius: '16px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: isLoading 
                ? 'none' 
                : '0 4px 14px 0 rgba(131, 205, 45, 0.4)',
              opacity: isLoading ? 0.6 : 1,
            }}
            onTouchStart={(e) => {
              if (!isLoading) {
                e.currentTarget.style.transform = 'scale(0.98)';
                e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(131, 205, 45, 0.5)';
              }
            }}
            onTouchEnd={(e) => {
              if (!isLoading) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(131, 205, 45, 0.4)';
              }
            }}
          >
            {isLoading ? 'Starte...' : 'Aktivität starten'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  activity,
  room,
  onForceStart,
  onCancel,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          padding: '32px',
          maxWidth: '480px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Warning Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(to right, #F59E0B, #EAB308)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            boxShadow: '0 8px 32px rgba(245, 158, 11, 0.3)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <h2
          style={{
            fontSize: '28px',
            fontWeight: 700,
            marginBottom: '16px',
            color: '#1F2937',
            lineHeight: 1.2,
          }}
        >
          Session Konflikt
        </h2>

        <p
          style={{
            fontSize: '16px',
            color: '#6B7280',
            marginBottom: '32px',
            lineHeight: 1.5,
          }}
        >
          Es läuft bereits eine Session für diese Aktivität oder diesen Raum. Möchten Sie die bestehende Session beenden und eine neue starten?
        </p>

        {/* Activity Details Card */}
        <div
          style={{
            backgroundColor: '#FEF3C7',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '32px',
            border: '1px solid #FCD34D',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#92400E',
              marginBottom: '8px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Neue Session
          </div>
          
          <div
            style={{
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '12px',
              color: '#1F2937',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {activity?.name}
          </div>
          
          <div
            style={{
              fontSize: '16px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87C10" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>
              <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2"/>
              <circle cx="11" cy="12" r="1"/>
            </svg>
            {room.name}
          </div>
        </div>

        {/* Warning Message */}
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#DC2626',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            Diese Aktion beendet die aktuelle Session
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={{
              flex: 1,
              height: '52px',
              fontSize: '16px',
              fontWeight: 600,
              color: '#6B7280',
              backgroundColor: 'transparent',
              border: '2px solid #E5E7EB',
              borderRadius: '16px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              opacity: isLoading ? 0.6 : 1,
            }}
            onTouchStart={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = '#F9FAFB';
                e.currentTarget.style.borderColor = '#D1D5DB';
              }
            }}
            onTouchEnd={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = '#E5E7EB';
              }
            }}
          >
            Abbrechen
          </button>
          
          <button
            onClick={onForceStart}
            disabled={isLoading}
            style={{
              flex: 1,
              height: '52px',
              fontSize: '16px',
              fontWeight: 600,
              color: '#FFFFFF',
              background: isLoading 
                ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                : 'linear-gradient(to right, #DC2626, #B91C1C)',
              border: 'none',
              borderRadius: '16px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: isLoading 
                ? 'none' 
                : '0 4px 14px 0 rgba(220, 38, 38, 0.4)',
              opacity: isLoading ? 0.6 : 1,
            }}
            onTouchStart={(e) => {
              if (!isLoading) {
                e.currentTarget.style.transform = 'scale(0.98)';
                e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(220, 38, 38, 0.5)';
              }
            }}
            onTouchEnd={(e) => {
              if (!isLoading) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(220, 38, 38, 0.4)';
              }
            }}
          >
            {isLoading ? 'Überschreibe...' : 'Session überschreiben'}
          </button>
        </div>
      </div>
    </div>
  );
};

function RoomSelectionPage() {
  const {
    authenticatedUser,
    selectedActivity,
    rooms,
    isLoading,
    error,
    fetchRooms,
    selectRoom,
    fetchCurrentSession,
  } = useUserStore();

  const [isStartingSession, setIsStartingSession] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const navigate = useNavigate();
  const fetchedRef = useRef(false);

  // Create logger instance for this component
  const logger = createLogger('RoomSelectionPage');

  // Calculate pagination
  const totalPages = Math.ceil(rooms.length / ROOMS_PER_PAGE);
  const paginatedRooms = React.useMemo(() => {
    const start = currentPage * ROOMS_PER_PAGE;
    const end = start + ROOMS_PER_PAGE;
    return rooms.slice(start, end);
  }, [rooms, currentPage]);

  // Calculate empty slots to maintain grid layout
  const emptySlots = React.useMemo(() => {
    const roomsOnPage = paginatedRooms.length;
    if (roomsOnPage < ROOMS_PER_PAGE) {
      return ROOMS_PER_PAGE - roomsOnPage;
    }
    return 0;
  }, [paginatedRooms]);

  // Redirect if missing authentication or selected activity
  useEffect(() => {
    if (!authenticatedUser) {
      logger.warn('Unauthenticated access to RoomSelectionPage');
      logNavigation('RoomSelectionPage', '/');
      void navigate('/');
      return;
    }

    if (!selectedActivity) {
      logger.warn('No activity selected, redirecting to activity selection');
      logNavigation('RoomSelectionPage', '/activity-selection');
      void navigate('/activity-selection');
      return;
    }

    logger.debug('RoomSelectionPage component mounted', {
      user: authenticatedUser.staffName,
      activity: selectedActivity.name,
    });

    return () => {
      logger.debug('RoomSelectionPage component unmounted');
    };
  }, [authenticatedUser, selectedActivity, navigate, logger]);

  // Fetch rooms when component mounts
  useEffect(() => {
    if (authenticatedUser && selectedActivity && !fetchedRef.current) {
      fetchedRef.current = true;
      logger.info('Fetching available rooms');
      void fetchRooms();
    }
  }, [authenticatedUser, selectedActivity, fetchRooms, logger]);

  // Handle room selection
  const handleRoomSelect = (room: Room) => {
    logger.info('Room selected for confirmation', {
      roomId: room.id,
      roomName: room.name,
      activityId: selectedActivity?.id,
    });

    setSelectedRoom(room);
    setShowConfirmModal(true);
  };

  // Handle session start confirmation
  const handleConfirmSession = async () => {
    if (!selectedRoom || !selectedActivity || !authenticatedUser) return;

    setIsStartingSession(true);
    try {
      logger.info('Starting activity session', {
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
        staffId: authenticatedUser.staffId,
      });

      performance.mark('session-start-begin');

      const sessionRequest: SessionStartRequest = {
        activity_id: selectedActivity.id,
        room_id: selectedRoom.id, // Manual room selection
        supervisor_ids: [authenticatedUser.staffId], // For now, use current staff as single supervisor
      };

      const sessionResponse = await api.startSession(authenticatedUser.pin, sessionRequest);

      performance.mark('session-start-end');
      performance.measure('session-start-duration', 'session-start-begin', 'session-start-end');
      const measure = performance.getEntriesByName('session-start-duration')[0];

      logger.info('Session started successfully', {
        sessionId: sessionResponse.active_group_id,
        activityId: sessionResponse.activity_id,
        deviceId: sessionResponse.device_id,
        duration_ms: measure.duration,
      });

      // Store the selected room
      selectRoom(selectedRoom.id);

      // Fetch and update current session to ensure state consistency
      await fetchCurrentSession();

      logUserAction('session_started', {
        sessionId: sessionResponse.active_group_id,
        activityId: selectedActivity.id,
        activityName: selectedActivity.name,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
      });

      // Close modals before navigation
      setShowConfirmModal(false);
      setIsStartingSession(false);
      setSelectedRoom(null); // Clear local component state only

      // Navigate to NFC scanning page
      logNavigation('RoomSelectionPage', 'NFC-Scanning', {
        sessionId: sessionResponse.active_group_id,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      void navigate('/nfc-scanning');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Fehler beim Starten der Session';
      logger.error('Session start failed', {
        error: errorMessage,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      logError(
        error instanceof Error ? error : new Error(String(error)),
        'RoomSelectionPage.handleConfirmSession'
      );

      // Handle 409 Conflict - show conflict modal
      logger.debug('Checking for conflict error', { errorMessage, includes409: errorMessage.includes('409'), includesConflict: errorMessage.includes('Conflict') });
      
      if (errorMessage.includes('409') || errorMessage.includes('Conflict')) {
        logger.info('Showing conflict modal due to 409 error');
        setShowConflictModal(true);
        setIsStartingSession(false);
        return; // Don't close the confirm modal yet, show conflict modal instead
      } else {
        alert(`Fehler beim Starten der Aktivität: ${errorMessage}`);
        setIsStartingSession(false);
        setShowConfirmModal(false);
        setSelectedRoom(null);
      }
    }
  };

  // Handle force session start from conflict modal
  const handleForceSessionStart = async () => {
    if (!selectedRoom || !selectedActivity || !authenticatedUser) return;

    setIsStartingSession(true);
    try {
      logger.info('Retrying session start with force=true', {
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      const forceSessionRequest: SessionStartRequest = {
        activity_id: selectedActivity.id,
        room_id: selectedRoom.id, // Manual room selection
        supervisor_ids: [authenticatedUser.staffId], // For now, use current staff as single supervisor
        force: true, // Force override any conflicts
      };

      const sessionResponse = await api.startSession(authenticatedUser.pin, forceSessionRequest);

      logger.info('Session started successfully with force override', {
        sessionId: sessionResponse.active_group_id,
        activityId: sessionResponse.activity_id,
        deviceId: sessionResponse.device_id,
      });

      // Store the selected room
      selectRoom(selectedRoom.id);

      // Fetch and update current session to ensure state consistency
      await fetchCurrentSession();

      logUserAction('session_started_force', {
        sessionId: sessionResponse.active_group_id,
        activityId: selectedActivity.id,
        activityName: selectedActivity.name,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
      });

      // Close modals before navigation
      setShowConfirmModal(false);
      setShowConflictModal(false);
      setIsStartingSession(false);
      setSelectedRoom(null); // Clear local component state only

      // Navigate to NFC scanning page
      logNavigation('RoomSelectionPage', 'NFC-Scanning', {
        sessionId: sessionResponse.active_group_id,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });

      void navigate('/nfc-scanning');
    } catch (forceError) {
      const forceErrorMessage =
        forceError instanceof Error ? forceError.message : 'Fehler beim Überschreiben der Session';
      logger.error('Force session start also failed', {
        error: forceErrorMessage,
        activityId: selectedActivity.id,
        roomId: selectedRoom.id,
      });
      // Could add another error modal here, but for now use alert for force errors
      alert(`Fehler beim Überschreiben der Session: ${forceErrorMessage}`);
      // Clean up modal state only on error
      setIsStartingSession(false);
      setShowConfirmModal(false);
      setShowConflictModal(false);
      setSelectedRoom(null);
    }
  };

  // Handle conflict modal cancel
  const handleConflictCancel = () => {
    setShowConflictModal(false);
    setIsStartingSession(false);
    setShowConfirmModal(false);
    setSelectedRoom(null);
  };

  // Handle back navigation
  const handleGoBack = () => {
    logger.info('User navigating back to activity selection');
    logNavigation('RoomSelectionPage', 'ActivitySelectionPage', { reason: 'back_button' });
    void navigate('/activity-selection');
  };


  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
      logger.debug('Navigated to next page', { newPage: currentPage + 1, totalPages });
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
      logger.debug('Navigated to previous page', { newPage: currentPage - 1, totalPages });
    }
  };

  // Get door icon - commonly used for rooms/access points
  const getRoomIcon = () => {
    return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>
        <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2"/>
        <circle cx="11" cy="12" r="1"/>
      </svg>
    );
  };

  if (!authenticatedUser || !selectedActivity) {
    return null; // Will redirect via useEffect
  }

  return (
    <ContentBox centered shadow="lg" rounded="lg" padding={theme.spacing.md}>
      <div style={{ 
        width: '100%', 
        height: '100%',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Modern back button following tablet/mobile conventions */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleGoBack}
            style={{
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '0 28px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '28px',
              cursor: 'pointer',
              transition: 'all 200ms',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              position: 'relative',
              overflow: 'hidden',
              backdropFilter: 'blur(8px)',
            }}
            onTouchStart={(e) => {
              e.currentTarget.style.transform = 'scale(0.95)';
              e.currentTarget.style.backgroundColor = 'rgba(249, 250, 251, 0.95)';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
            }}
            onTouchEnd={(e) => {
              setTimeout(() => {
                if (e.currentTarget) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }
              }, 150);
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#374151"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5"/>
              <path d="M12 19l-7-7 7-7"/>
            </svg>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#374151',
              }}
            >
              Zurück
            </span>
          </button>
        </div>

        <h1
          style={{
            fontSize: '36px',
            fontWeight: theme.fonts.weight.bold,
            marginBottom: '48px',
            textAlign: 'center',
            color: theme.colors.text.primary,
          }}
        >
          Raum auswählen
        </h1>

        {error && (
          <div
            style={{
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              padding: theme.spacing.md,
              borderRadius: theme.borders.radius.md,
              marginBottom: theme.spacing.lg,
              textAlign: 'center',
              fontSize: '16px',
            }}
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '3px solid #E5E7EB',
                borderTopColor: '#f87C10',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        ) : (
          <>
            {/* No rooms state */}
            {rooms.length === 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: '400px',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>
                  <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2"/>
                  <circle cx="11" cy="12" r="1"/>
                </svg>
                <div
                  style={{
                    fontSize: '24px',
                    color: '#6B7280',
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                >
                  Keine Räume verfügbar
                </div>
                <div
                  style={{
                    fontSize: '16px',
                    color: '#9CA3AF',
                    textAlign: 'center',
                  }}
                >
                  Es sind derzeit keine Räume für die Auswahl verfügbar.
                </div>
              </div>
            )}

            {/* Rooms Grid */}
            {rooms.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '14px',
                  marginBottom: '12px',
                  flex: 1,
                  alignContent: 'start',
                }}
              >
                {paginatedRooms.map((room) => {
                  const isOccupied = room.is_occupied;
                  return (
                    <button
                      key={room.id}
                      onClick={() => !isOccupied && handleRoomSelect(room)}
                      disabled={isOccupied}
                      style={{
                        height: '160px',
                        padding: '16px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '18px',
                        fontWeight: 600,
                        color: isOccupied ? '#9CA3AF' : '#1F2937',
                        cursor: isOccupied ? 'not-allowed' : 'pointer',
                        transition: 'all 200ms',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        outline: 'none',
                        position: 'relative',
                        overflow: 'hidden',
                        minWidth: '0',
                        gap: '12px',
                        WebkitTapHighlightColor: 'transparent',
                        opacity: isOccupied ? 0.6 : 1,
                      }}
                      onTouchStart={(e) => {
                        if (!isOccupied) {
                          e.currentTarget.style.transform = 'scale(0.98)';
                          e.currentTarget.style.backgroundColor = '#FEF3E2';
                        }
                      }}
                      onTouchEnd={(e) => {
                        if (!isOccupied) {
                          setTimeout(() => {
                            if (e.currentTarget) {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }, 150);
                        }
                      }}
                    >
                      {/* Gradient border wrapper - Orange for available, gray for occupied */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '12px',
                          background: isOccupied 
                            ? 'linear-gradient(to right, #9CA3AF, #6B7280)'
                            : 'linear-gradient(to right, #f87C10, #e06c0a)',
                          zIndex: 0,
                        }}
                      />
                      
                      {/* Inner content wrapper for border effect */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: '2px',
                          borderRadius: '10px',
                          background: isOccupied
                            ? 'linear-gradient(to bottom, #F9FAFB, #F3F4F6)'
                            : 'linear-gradient(to bottom, #FFFFFF, #FEF7ED)',
                          zIndex: 1,
                        }}
                      />
                      
                      {/* Room Icon */}
                      <div
                        style={{
                          color: isOccupied ? '#9CA3AF' : '#f87C10',
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        {getRoomIcon()}
                      </div>
                      
                      {/* Room Name */}
                      <span
                        style={{
                          fontSize: '18px',
                          fontWeight: 600,
                          lineHeight: '1.2',
                          maxWidth: '100%',
                          wordBreak: 'break-word',
                          color: '#1F2937',
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        {room.name}
                      </span>

                      {/* Room capacity info */}
                      {room.capacity && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#6B7280',
                            position: 'relative',
                            zIndex: 2,
                          }}
                        >
                          {room.capacity} Plätze
                        </div>
                      )}

                      {/* Availability Badge */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          backgroundColor: isOccupied ? '#EF4444' : '#10B981',
                          color: '#FFFFFF',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          zIndex: 3,
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="12" r="10"/>
                        </svg>
                        {isOccupied ? 'Belegt' : 'Verfügbar'}
                      </div>
                    </button>
                  );
                })}
                
                {/* Empty placeholder slots */}
                {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    style={{
                      height: '160px',
                      backgroundColor: '#FAFAFA',
                      border: '2px dashed #E5E7EB',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: 0.4,
                      }}
                    >
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#9CA3AF"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>
                        <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2"/>
                        <circle cx="11" cy="12" r="1"/>
                      </svg>
                      <span
                        style={{
                          fontSize: '14px',
                          color: '#9CA3AF',
                          fontWeight: 400,
                        }}
                      >
                        Leer
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '12px',
                }}
              >
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                  style={{
                    height: 'auto',
                    width: 'auto',
                    fontSize: '18px',
                    fontWeight: 500,
                    padding: '8px 16px',
                    background: 'transparent',
                    color: currentPage === 0 ? '#9CA3AF' : '#3B82F6',
                    border: 'none',
                    borderRadius: '0',
                    cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 0 ? 0.5 : 1,
                    transition: 'all 200ms',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow: 'none',
                  }}
                >
                  ← Vorherige
                </button>

                <span
                  style={{
                    fontSize: '18px',
                    color: theme.colors.text.secondary,
                    fontWeight: 500,
                  }}
                >
                  Seite {currentPage + 1} von {totalPages}
                </span>

                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages - 1}
                  style={{
                    height: 'auto',
                    width: 'auto',
                    fontSize: '18px',
                    fontWeight: 500,
                    padding: '8px 16px',
                    background: 'transparent',
                    color: currentPage === totalPages - 1 ? '#9CA3AF' : '#3B82F6',
                    border: 'none',
                    borderRadius: '0',
                    cursor: currentPage === totalPages - 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages - 1 ? 0.5 : 1,
                    transition: 'all 200ms',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow: 'none',
                  }}
                >
                  Nächste →
                </button>
              </div>
            )}
          </>
        )}

        {/* Add animation keyframes */}
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        activity={selectedActivity}
        room={selectedRoom!}
        onConfirm={handleConfirmSession}
        onCancel={() => {
          setShowConfirmModal(false);
          setSelectedRoom(null);
        }}
        isLoading={isStartingSession}
      />

      {/* Conflict Resolution Modal */}
      <ConflictModal
        isOpen={showConflictModal}
        activity={selectedActivity}
        room={selectedRoom!}
        onForceStart={handleForceSessionStart}
        onCancel={handleConflictCancel}
        isLoading={isStartingSession}
      />
    </ContentBox>
  );
}

export default RoomSelectionPage;
