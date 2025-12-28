import { useCallback } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

import {
  api,
  mapServerErrorToGerman,
  type SessionStartRequest,
  type CurrentSession,
} from '../services/api';
import { useUserStore, isNetworkRelatedError } from '../store/userStore';
import { logNavigation, logUserAction } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

interface ModalState {
  setShowErrorModal: (show: boolean) => void;
  setErrorMessage: (message: string) => void;
  setShowConfirmModal: (show: boolean) => void;
}

interface HomeViewHandlers {
  handleLogout: () => Promise<void>;
  handleTagAssignment: () => void;
  handleStartActivity: () => Promise<void>;
  handleContinueActivity: () => void;
  handleTeamManagement: () => void;
  handleConfirmRecreation: () => Promise<void>;
}

// ============================================================================
// Pure helper functions
// ============================================================================

/** Format session recreation error message for display */
function formatRecreationError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : 'Fehler beim Starten der Aktivität';
  return isNetworkRelatedError(error)
    ? 'Netzwerkfehler beim Starten der Aktivität. Bitte Verbindung prüfen und erneut versuchen.'
    : mapServerErrorToGerman(rawMessage);
}

/** Validate that all session recreation prerequisites are met */
function validateSessionRecreationData(): {
  isValid: boolean;
  error?: string;
  sessionRequest?: SessionStartRequest;
} {
  const { selectedActivity, selectedRoom, selectedSupervisors } = useUserStore.getState();

  if (!selectedActivity || !selectedRoom || selectedSupervisors.length === 0) {
    return {
      isValid: false,
      error:
        'Die gespeicherten Sitzungsdaten sind unvollständig. Bitte wählen Sie Aktivität, Raum und Betreuer neu aus.',
    };
  }

  return {
    isValid: true,
    sessionRequest: {
      activity_id: selectedActivity.id,
      room_id: selectedRoom.id,
      supervisor_ids: selectedSupervisors.map(s => s.id),
    },
  };
}

/** Execute session recreation API call */
async function executeSessionRecreation(
  pin: string,
  sessionRequest: SessionStartRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    const sessionResponse = await api.startSession(pin, sessionRequest);

    logUserAction('Session recreated successfully', {
      sessionId: sessionResponse.active_group_id,
    });

    await useUserStore.getState().saveLastSessionData();
    return { success: true };
  } catch (error) {
    return { success: false, error: formatRecreationError(error) };
  }
}

// ============================================================================
// Handler factory functions (pure, no hooks)
// ============================================================================

function createLogoutHandler(
  currentSession: CurrentSession | null,
  pin: string | undefined,
  logout: () => Promise<void>,
  fetchCurrentSession: () => Promise<void>,
  navigate: NavigateFunction
): () => Promise<void> {
  return async () => {
    if (currentSession) {
      logUserAction('Ending current session');
      try {
        await api.endSession(pin!);
        await fetchCurrentSession();
        logUserAction('Session ended successfully');
      } catch (error) {
        logUserAction('Failed to end session', { error });
      }
    } else {
      logUserAction('User logout initiated');
      await logout();
      logNavigation('Home View', '/');
      void navigate('/');
    }
  };
}

function createTagAssignmentHandler(
  hasSupervisors: boolean,
  modalState: ModalState,
  navigate: NavigateFunction
): () => void {
  return () => {
    if (!hasSupervisors) {
      logUserAction('NFC-Scan attempted without supervisors');
      modalState.setErrorMessage(
        "Bitte wählen Sie zuerst mindestens einen Betreuer über 'Team anpassen' aus, bevor Sie die NFC-Scan Funktion nutzen können."
      );
      modalState.setShowErrorModal(true);
      return;
    }
    logNavigation('Home View', '/tag-assignment');
    void navigate('/tag-assignment');
  };
}

function createStartActivityHandler(
  sessionSettings: { use_last_session?: boolean; last_session?: unknown } | null,
  validateAndRecreateSession: () => Promise<boolean>,
  modalState: ModalState,
  navigate: NavigateFunction
): () => Promise<void> {
  return async () => {
    const shouldRecreateLastSession =
      sessionSettings?.use_last_session && sessionSettings.last_session;

    if (shouldRecreateLastSession) {
      logUserAction('Attempting to recreate last session');
      const success = await validateAndRecreateSession();

      if (success) {
        modalState.setShowConfirmModal(true);
        return;
      }

      const latestError =
        useUserStore.getState().error ??
        'Die gespeicherte Sitzung konnte nicht überprüft werden. Bitte Verbindung prüfen oder Sitzung neu erstellen.';
      modalState.setErrorMessage(latestError);
      modalState.setShowErrorModal(true);
      modalState.setShowConfirmModal(false);
    } else {
      logNavigation('Home View', '/activity-selection');
      void navigate('/activity-selection');
    }
  };
}

function createContinueActivityHandler(
  currentSession: CurrentSession | null,
  navigate: NavigateFunction
): () => void {
  return () => {
    if (!currentSession) return;

    logNavigation('Home View', '/nfc-scanning', {
      activeGroupId: currentSession.active_group_id,
      activityName: currentSession.activity_name,
    });
    void navigate('/nfc-scanning');
  };
}

function createTeamManagementHandler(navigate: NavigateFunction): () => void {
  return () => {
    logNavigation('Home View', '/team-management');
    void navigate('/team-management');
  };
}

function createConfirmRecreationHandler(
  pin: string | undefined,
  hasLastSession: boolean,
  fetchCurrentSession: () => Promise<void>,
  modalState: ModalState,
  navigate: NavigateFunction
): () => Promise<void> {
  return async () => {
    if (!pin || !hasLastSession) return;

    const validation = validateSessionRecreationData();
    if (!validation.isValid) {
      modalState.setErrorMessage(validation.error!);
      modalState.setShowErrorModal(true);
      modalState.setShowConfirmModal(false);
      return;
    }

    logUserAction('Confirming session recreation', {
      sessionRequest: validation.sessionRequest,
    });

    const result = await executeSessionRecreation(pin, validation.sessionRequest!);
    modalState.setShowConfirmModal(false);

    if (!result.success) {
      modalState.setErrorMessage(result.error!);
      modalState.setShowErrorModal(true);
      return;
    }

    await fetchCurrentSession();
    logNavigation('Home View', '/nfc-scanning');
    void navigate('/nfc-scanning');
  };
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Custom hook that encapsulates all HomeViewPage handler logic.
 * This moves cognitive complexity out of the component into this hook,
 * where SonarCloud counts it as a separate function.
 */
export function useHomeViewHandlers(modalState: ModalState): HomeViewHandlers {
  const {
    authenticatedUser,
    currentSession,
    logout,
    fetchCurrentSession,
    selectedSupervisors,
    sessionSettings,
    validateAndRecreateSession,
  } = useUserStore();
  const navigate = useNavigate();

  const hasSupervisors = selectedSupervisors.length > 0;

  const handleLogout = useCallback(
    () =>
      createLogoutHandler(
        currentSession,
        authenticatedUser?.pin,
        logout,
        fetchCurrentSession,
        navigate
      )(),
    [currentSession, authenticatedUser?.pin, logout, fetchCurrentSession, navigate]
  );

  const handleTagAssignment = useCallback(
    () => createTagAssignmentHandler(hasSupervisors, modalState, navigate)(),
    [hasSupervisors, modalState, navigate]
  );

  const handleStartActivity = useCallback(
    () =>
      createStartActivityHandler(
        sessionSettings,
        validateAndRecreateSession,
        modalState,
        navigate
      )(),
    [sessionSettings, validateAndRecreateSession, modalState, navigate]
  );

  const handleContinueActivity = useCallback(
    () => createContinueActivityHandler(currentSession, navigate)(),
    [currentSession, navigate]
  );

  const handleTeamManagement = useCallback(
    () => createTeamManagementHandler(navigate)(),
    [navigate]
  );

  const handleConfirmRecreation = useCallback(
    () =>
      createConfirmRecreationHandler(
        authenticatedUser?.pin,
        !!sessionSettings?.last_session,
        fetchCurrentSession,
        modalState,
        navigate
      )(),
    [
      authenticatedUser?.pin,
      sessionSettings?.last_session,
      fetchCurrentSession,
      modalState,
      navigate,
    ]
  );

  return {
    handleLogout,
    handleTagAssignment,
    handleStartActivity,
    handleContinueActivity,
    handleTeamManagement,
    handleConfirmRecreation,
  };
}
