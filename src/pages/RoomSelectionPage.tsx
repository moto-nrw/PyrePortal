import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal, ModalBase } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import {
  api,
  mapServerErrorToGerman,
  isNetworkRelatedError,
  type Room,
  type SessionStartRequest,
  type ActivityResponse,
} from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

const ROOMS_PER_PAGE = 10; // 5x2 grid to match activity page

interface ConfirmationModalProps {
  isOpen: boolean;
  activity: ActivityResponse | null;
  room: Room;
  supervisors: Array<{ id: number; name: string }>;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

interface ConflictModalProps {
  isOpen: boolean;
  activity: ActivityResponse | null;
  room: Room;
  supervisors: Array<{ id: number; name: string }>;
  onForceStart: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  activity,
  room,
  supervisors,
  onConfirm,
  onCancel,
  isLoading,
}) => (
  <ModalBase
    isOpen={isOpen}
    onClose={onCancel}
    size="md"
    backgroundColor="#FFFFFF"
    backdropBlur="6px"
    closeOnBackdropClick={!isLoading}
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
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </div>

    <h2
      style={{
        fontSize: '32px',
        fontWeight: 700,
        marginBottom: '12px',
        color: '#1F2937',
        lineHeight: 1.2,
      }}
    >
      Aktivität starten?
    </h2>

    {/* Activity Details Card */}
    <div
      style={{
        backgroundColor: '#F8FAFC',
        borderRadius: designSystem.borderRadius.lg,
        padding: '20px',
        marginBottom: '20px',
        border: '1px solid #E5E7EB',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          marginBottom: '8px',
        }}
      >
        <div
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#1F2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#14B8A6"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {activity?.name}
        </div>

        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#9CA3AF',
          }}
        ></div>

        <div
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#1F2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4f46e5"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
            <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
            <circle cx="11" cy="12" r="1" />
          </svg>
          {room.name}
        </div>
      </div>

      {room.room_type && (
        <div
          style={{
            fontSize: '14px',
            color: '#6B7280',
            marginBottom: '0px',
          }}
        >
          Typ: {room.room_type}
        </div>
      )}
    </div>

    {/* Supervisors */}
    <div
      style={{
        backgroundColor: '#F9FAFB',
        borderRadius: designSystem.borderRadius.lg,
        padding: '16px',
        marginBottom: '20px',
        border: '1px solid #E5E7EB',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#374151',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Betreuer ({supervisors.length})
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {supervisors.map(supervisor => (
          <div
            key={supervisor.id}
            style={{
              backgroundColor: '#FFFFFF',
              padding: '8px 12px',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1F2937',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#14B8A6"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {supervisor.name}
          </div>
        ))}
      </div>
    </div>

    {/* Action Buttons */}
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
      <button
        onClick={onCancel}
        disabled={isLoading}
        style={{
          flex: 1,
          height: '68px',
          fontSize: '20px',
          fontWeight: 600,
          color: '#6B7280',
          backgroundColor: 'transparent',
          border: '2px solid #E5E7EB',
          borderRadius: designSystem.borderRadius.lg,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          opacity: isLoading ? 0.6 : 1,
        }}
        onTouchStart={e => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = '#F9FAFB';
            e.currentTarget.style.borderColor = '#D1D5DB';
          }
        }}
        onTouchEnd={e => {
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
          height: '68px',
          fontSize: '20px',
          fontWeight: 600,
          color: '#FFFFFF',
          background: isLoading
            ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
            : 'linear-gradient(to right, #83cd2d, #6ba529)',
          border: 'none',
          borderRadius: designSystem.borderRadius.lg,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: isLoading ? 'none' : '0 4px 14px 0 rgba(131, 205, 45, 0.4)',
          opacity: isLoading ? 0.6 : 1,
        }}
        onTouchStart={e => {
          if (!isLoading) {
            e.currentTarget.style.transform = 'scale(0.98)';
            e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(131, 205, 45, 0.5)';
          }
        }}
        onTouchEnd={e => {
          if (!isLoading) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(131, 205, 45, 0.4)';
          }
        }}
      >
        {isLoading ? 'Starte...' : 'Aktivität starten'}
      </button>
    </div>
  </ModalBase>
);

const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  activity,
  room,
  supervisors,
  onForceStart,
  onCancel,
  isLoading,
}) => (
  <ModalBase
    isOpen={isOpen}
    onClose={onCancel}
    size="sm"
    backgroundColor="#FFFFFF"
    closeOnBackdropClick={!isLoading}
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
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
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
      Es läuft bereits eine Session für diese Aktivität oder diesen Raum. Möchten Sie die bestehende
      Session beenden und eine neue starten?
    </p>

    {/* Activity Details Card */}
    <div
      style={{
        backgroundColor: '#FEF3C7',
        borderRadius: designSystem.borderRadius.lg,
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#1F2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#14B8A6"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {activity?.name}
        </div>

        <div
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#9CA3AF',
          }}
        ></div>

        <div
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#1F2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f87C10"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
            <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
            <circle cx="11" cy="12" r="1" />
          </svg>
          {room.name}
        </div>
      </div>
    </div>

    {/* Supervisors */}
    <div
      style={{
        backgroundColor: '#F0F9FF',
        borderRadius: designSystem.borderRadius.lg,
        padding: '20px',
        marginBottom: '32px',
        border: '1px solid #BAE6FD',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#0369A1',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Betreuer ({supervisors.length})
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {supervisors.map(supervisor => (
          <div
            key={supervisor.id}
            style={{
              backgroundColor: '#FFFFFF',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#1F2937',
              border: '1px solid #E0E7FF',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#14B8A6"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {supervisor.name}
          </div>
        ))}
      </div>
    </div>

    {/* Warning Message */}
    <div
      style={{
        backgroundColor: '#FEF2F2',
        border: '1px solid #FECACA',
        borderRadius: designSystem.borderRadius.md,
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
          height: '68px',
          fontSize: '20px',
          fontWeight: 600,
          color: '#6B7280',
          backgroundColor: 'transparent',
          border: '2px solid #E5E7EB',
          borderRadius: designSystem.borderRadius.lg,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          opacity: isLoading ? 0.6 : 1,
        }}
        onTouchStart={e => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = '#F9FAFB';
            e.currentTarget.style.borderColor = '#D1D5DB';
          }
        }}
        onTouchEnd={e => {
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
          height: '68px',
          fontSize: '20px',
          fontWeight: 600,
          color: '#FFFFFF',
          background: isLoading
            ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
            : 'linear-gradient(to right, #DC2626, #B91C1C)',
          border: 'none',
          borderRadius: designSystem.borderRadius.lg,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 200ms',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: isLoading ? 'none' : '0 4px 14px 0 rgba(220, 38, 38, 0.4)',
          opacity: isLoading ? 0.6 : 1,
        }}
        onTouchStart={e => {
          if (!isLoading) {
            e.currentTarget.style.transform = 'scale(0.98)';
            e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(220, 38, 38, 0.5)';
          }
        }}
        onTouchEnd={e => {
          if (!isLoading) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(220, 38, 38, 0.4)';
          }
        }}
      >
        {isLoading ? 'Starte...' : 'Trotzdem starten'}
      </button>
    </div>
  </ModalBase>
);

function RoomSelectionPage() {
  const {
    authenticatedUser,
    selectedActivity,
    selectedSupervisors,
    rooms,
    isLoading,
    error,
    fetchRooms,
    selectRoom,
    fetchCurrentSession,
    saveLastSessionData,
  } = useUserStore();

  const [isStartingSession, setIsStartingSession] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const navigate = useNavigate();
  const fetchedRef = useRef(false);

  // Helper to show error modal with network-aware message
  const showError = useCallback((error: unknown, fallbackMessage: string) => {
    const rawMessage = error instanceof Error ? error.message : fallbackMessage;
    const userMessage = isNetworkRelatedError(error)
      ? 'Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.'
      : mapServerErrorToGerman(rawMessage);
    setErrorMessage(userMessage);
    setShowErrorModal(true);
  }, []);

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

  // Redirect if missing authentication, selected activity, or supervisors
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

    if (!selectedSupervisors || selectedSupervisors.length === 0) {
      logger.warn('No supervisors selected, redirecting to staff selection');
      logNavigation('RoomSelectionPage', '/staff-selection');
      void navigate('/staff-selection');
      return;
    }

    logger.debug('RoomSelectionPage component mounted', {
      user: authenticatedUser.staffName,
      activity: selectedActivity.name,
      supervisors: selectedSupervisors.length,
    });

    return () => {
      logger.debug('RoomSelectionPage component unmounted');
    };
  }, [authenticatedUser, selectedActivity, selectedSupervisors, navigate, logger]);

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
        supervisorCount: selectedSupervisors.length,
        supervisorIds: selectedSupervisors.map(s => s.id),
      });

      performance.mark('session-start-begin');

      const sessionRequest: SessionStartRequest = {
        activity_id: selectedActivity.id,
        room_id: selectedRoom.id, // Manual room selection
        supervisor_ids: selectedSupervisors.map(s => s.id), // Use all selected supervisors
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

      // Auto-save this session for quick recreation
      await saveLastSessionData();

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
      logger.debug('Checking for conflict error', {
        errorMessage,
        includes409: errorMessage.includes('409'),
        includesConflict: errorMessage.includes('Conflict'),
      });

      if (errorMessage.includes('409') || errorMessage.includes('Conflict')) {
        logger.info('Showing conflict modal due to 409 error');
        setShowConflictModal(true);
        setIsStartingSession(false);
        return; // Don't close the confirm modal yet, show conflict modal instead
      } else {
        showError(error, 'Fehler beim Starten der Aktivität');
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
        supervisor_ids: selectedSupervisors.map(s => s.id), // Use all selected supervisors
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

      // Auto-save this session for quick recreation
      await saveLastSessionData();

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
      showError(forceError, 'Fehler beim Überschreiben der Session');
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
    logger.info('User navigating back to staff selection');
    logNavigation('RoomSelectionPage', 'StaffSelectionPage', { reason: 'back_button' });
    void navigate('/staff-selection');
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
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
        <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
        <circle cx="11" cy="12" r="1" />
      </svg>
    );
  };

  if (
    !authenticatedUser ||
    !selectedActivity ||
    !selectedSupervisors ||
    selectedSupervisors.length === 0
  ) {
    return null; // Will redirect via useEffect
  }

  return (
    <BackgroundWrapper>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Modern back button following tablet/mobile conventions */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 10,
          }}
        >
          <BackButton onClick={handleGoBack} />
        </div>

        <h1
          style={{
            fontSize: '56px',
            fontWeight: 700,
            marginTop: '40px',
            marginBottom: '20px',
            textAlign: 'center',
            color: '#111827',
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
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
                  <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
                  <circle cx="11" cy="12" r="1" />
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
                  marginTop: '24px',
                  marginBottom: '0px',
                  alignContent: 'start',
                }}
              >
                {paginatedRooms.map(room => {
                  const isOccupied = room.is_occupied;
                  const isSelected = selectedRoom?.id === room.id;
                  return (
                    <button
                      key={room.id}
                      onClick={() => !isOccupied && handleRoomSelect(room)}
                      disabled={isOccupied}
                      style={{
                        width: '100%',
                        height: '160px',
                        backgroundColor: '#FFFFFF',
                        border: isSelected ? '3px solid #83CD2D' : '2px solid #E5E7EB',
                        borderRadius: '24px',
                        cursor: isOccupied ? 'not-allowed' : 'pointer',
                        outline: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        position: 'relative',
                        transition: 'all 150ms ease-out',
                        boxShadow: isSelected
                          ? '0 8px 30px rgba(131, 205, 45, 0.2)'
                          : '0 4px 12px rgba(0, 0, 0, 0.08)',
                        opacity: isOccupied ? 0.6 : 1,
                      }}
                      onTouchStart={e => {
                        if (!isOccupied) e.currentTarget.style.transform = 'scale(0.98)';
                      }}
                      onTouchEnd={e => {
                        if (!isOccupied)
                          setTimeout(() => {
                            if (e.currentTarget) e.currentTarget.style.transform = 'scale(1)';
                          }, 50);
                      }}
                    >
                      {/* Selection indicator */}
                      {!isOccupied && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: isSelected
                              ? designSystem.colors.primaryGreen
                              : '#E5E7EB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 200ms',
                          }}
                        >
                          {isSelected && (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#FFFFFF"
                              strokeWidth="3"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </div>
                      )}

                      {/* Room Icon - circle tint + dark indigo icon */}
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          backgroundColor: isOccupied ? '#F3F4F6' : 'rgba(99,102,241,0.15)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isOccupied ? '#9CA3AF' : '#4f46e5',
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
                          fontWeight: 700,
                          lineHeight: '1.2',
                          maxWidth: '100%',
                          wordBreak: 'break-word',
                          textAlign: 'center',
                          color: '#111827',
                        }}
                      >
                        {room.name}
                      </span>

                      {/* Room capacity info */}
                      {room.capacity && (
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>
                          {room.capacity} Plätze
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Empty placeholder slots */}
                {emptySlots > 0 &&
                  Array.from({ length: emptySlots }).map((_, index) => (
                    <div
                      key={`empty-slot-${currentPage}-${index}`}
                      style={{
                        height: '160px',
                        backgroundColor: '#FAFAFA',
                        border: '2px dashed #E5E7EB',
                        borderRadius: designSystem.borderRadius.md,
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
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
                          <path d="M18 2h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2" />
                          <circle cx="11" cy="12" r="1" />
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
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  marginTop: '24px',
                  width: '100%',
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
                    justifySelf: 'start',
                  }}
                >
                  <FontAwesomeIcon icon={faChevronLeft} style={{ marginRight: '6px' }} />
                  Vorherige
                </button>

                <span
                  style={{
                    fontSize: '18px',
                    color: theme.colors.text.secondary,
                    fontWeight: 500,
                    justifySelf: 'center',
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
                    justifySelf: 'end',
                  }}
                >
                  Nächste
                  <FontAwesomeIcon icon={faChevronRight} style={{ marginLeft: '6px' }} />
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
        supervisors={selectedSupervisors}
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
        supervisors={selectedSupervisors}
        onForceStart={handleForceSessionStart}
        onCancel={handleConflictCancel}
        isLoading={isStartingSession}
      />
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        message={errorMessage}
        autoCloseDelay={5000}
      />
    </BackgroundWrapper>
  );
}

export default RoomSelectionPage;
