import { adapter } from '@platform';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pickRandomMockTag } from '../dev/mockScanSource';
import { isRealScanningEnabled } from '../platform/adapter';
import { api, type TagAssignmentCheck } from '../services/api';
import { useUserStore } from '../store/userStore';
import { createLogger, logError, logUserAction } from '../utils/logger';

const logger = createLogger('useTagAssignmentScan');

/**
 * Helper to get assigned person from TagAssignmentCheck
 */
export const getAssignedPerson = (assignment: TagAssignmentCheck | null) => {
  if (!assignment?.assigned) return null;
  return assignment.person ?? null;
};

const SCAN_INVOKE_TIMEOUT_MS = 20_000;

const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timeoutHandle);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutHandle);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
};

/**
 * Tag assignment scan workflow.
 *
 * Encapsulates the single-tag scan via the platform adapter (with frontend
 * timeout and cancellation), the development mock scan, the tag assignment
 * check against the backend and the unassign flow (student vs. staff).
 */
export function useTagAssignmentScan() {
  const { authenticatedUser } = useUserStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedTag, setScannedTag] = useState<string | null>(null);
  const [tagAssignment, setTagAssignment] = useState<TagAssignmentCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);
  const [isUnassigning, setIsUnassigning] = useState(false);

  // Refs for scan cancellation
  const mockScanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanCancelledRef = useRef(false);

  const clearStates = useCallback(() => {
    setScannedTag(null);
    setTagAssignment(null);
    setError(null);
    setSuccess(null);
    setShowUnassignConfirm(false);
  }, []);

  // Cancel ongoing scan operation
  const cancelScan = useCallback(() => {
    logUserAction('RFID scanning cancelled by user');

    // Mark scan as cancelled to prevent processing results
    scanCancelledRef.current = true;

    // Clear mock scan timeout if running
    if (mockScanTimeoutRef.current) {
      clearTimeout(mockScanTimeoutRef.current);
      mockScanTimeoutRef.current = null;
    }

    // Close modal and reset loading state
    setShowScanner(false);
    setIsLoading(false);
  }, []);

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (mockScanTimeoutRef.current) {
        clearTimeout(mockScanTimeoutRef.current);
      }
    };
  }, []);

  // Check current tag assignment
  const checkTagAssignment = async (tagId: string): Promise<TagAssignmentCheck> => {
    if (!authenticatedUser?.pin) {
      throw new Error('Keine Authentifizierung verfügbar');
    }

    return await api.checkTagAssignment(authenticatedUser.pin, tagId);
  };

  // Handle tag scanned (connection point for RFID module)
  const handleTagScanned = async (tagId: string) => {
    setIsLoading(true);
    setShowScanner(false);
    setScannedTag(tagId);

    try {
      logUserAction('RFID tag scanned', { tagId });

      // Check if tag is already assigned
      const assignment = await checkTagAssignment(tagId);
      setTagAssignment(assignment);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logError(error, 'Failed to process scanned tag');
      setError('Armband konnte nicht überprüft werden. Bitte Internetverbindung prüfen.');
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Start RFID scanning process
  const startScanning = async () => {
    logUserAction('RFID scanning started');

    // Reset cancellation flag at start of new scan
    scanCancelledRef.current = false;

    clearStates();
    setShowScanner(true);
    setIsLoading(true);

    try {
      if (!isRealScanningEnabled()) {
        // Development mock behavior - store timeout ref for cancellation
        mockScanTimeoutRef.current = setTimeout(() => {
          // Check if scan was cancelled before processing
          if (scanCancelledRef.current) {
            logger.debug('Mock scan completed but was cancelled, ignoring result');
            return;
          }

          const mockTagId = pickRandomMockTag();
          logUserAction('Mock RFID tag scanned', { tagId: mockTagId, platform: 'Development' });
          mockScanTimeoutRef.current = null;
          void handleTagScanned(mockTagId);
        }, 2000);
        return;
      }

      // Use real RFID scanner via platform adapter with frontend timeout safety net.
      const result = await withTimeout(
        adapter.scanSingleTag(SCAN_INVOKE_TIMEOUT_MS),
        SCAN_INVOKE_TIMEOUT_MS,
        'RFID-Scan Zeitüberschreitung'
      );

      // Check if scan was cancelled while waiting for result
      if (scanCancelledRef.current) {
        logger.debug('RFID scan completed but was cancelled, ignoring result');
        return;
      }

      if (result.success && result.tag_id) {
        logUserAction('RFID tag scanned successfully', { tagId: result.tag_id });
        void handleTagScanned(result.tag_id);
      } else {
        const errorMessage = result.error ?? 'Unknown scanning error';
        logError(new Error(errorMessage), 'RFID scanning failed');
        setError('Armband konnte nicht gelesen werden. Bitte erneut versuchen.');
        setShowErrorModal(true);
        setShowScanner(false);
      }
    } catch (err) {
      // Check if error was due to cancellation
      if (scanCancelledRef.current) {
        logger.debug('RFID scan error after cancellation, ignoring');
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      logError(error, 'RFID scanner invocation failed');
      const timeoutError = error.message.toLowerCase().includes('zeitüberschreitung');
      setError(
        timeoutError
          ? 'Scanner reagiert nicht mehr. Bitte Scanner neu starten und erneut versuchen.'
          : 'Verbindung zum Scanner unterbrochen. Bitte Scanner neu starten.'
      );
      setShowErrorModal(true);
      setShowScanner(false);
    } finally {
      // Only update loading state if not cancelled (cancelScan handles this)
      if (!scanCancelledRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Start a new scan
  const scanAnother = () => {
    logUserAction('Starting new tag scan');
    clearStates();
    void startScanning();
  };

  // Handle unassigning a tag from a student or staff member
  const unassignTag = async () => {
    const assignedPerson = getAssignedPerson(tagAssignment);
    if (!authenticatedUser?.pin || !assignedPerson || !scannedTag) return;

    setIsUnassigning(true);
    try {
      const result =
        tagAssignment?.person_type === 'staff'
          ? await api.unassignStaffTag(authenticatedUser.pin, assignedPerson.id)
          : await api.unassignStudentTag(authenticatedUser.pin, assignedPerson.id);

      if (!result.success) {
        setShowUnassignConfirm(false);
        setError(result.message ?? 'Zuweisung konnte nicht aufgehoben werden.');
        setShowErrorModal(true);
        return;
      }

      // Clear stale RFID caches for this tag
      useUserStore.getState().clearTagScan(scannedTag);

      setShowUnassignConfirm(false);
      setTagAssignment(null);
      setScannedTag(null);
      setSuccess(`Armband wurde von ${assignedPerson.name} entfernt`);
    } catch (err) {
      logger.error('Failed to unassign RFID tag', {
        error: err instanceof Error ? err.message : String(err),
      });
      setShowUnassignConfirm(false);
      setError('Zuweisung konnte nicht aufgehoben werden. Bitte erneut versuchen.');
      setShowErrorModal(true);
    } finally {
      setIsUnassigning(false);
    }
  };

  const openUnassignConfirm = useCallback(() => setShowUnassignConfirm(true), []);
  const closeUnassignConfirm = useCallback(() => setShowUnassignConfirm(false), []);
  const closeErrorModal = useCallback(() => setShowErrorModal(false), []);

  // Surface a validation error in the error modal
  const showError = useCallback((message: string) => {
    setError(message);
    setShowErrorModal(true);
  }, []);

  // Restore tag data (e.g. when coming back from student selection)
  const restoreScan = useCallback((tag: string, assignment: TagAssignmentCheck) => {
    setScannedTag(tag);
    setTagAssignment(assignment);
  }, []);

  return {
    // State
    isLoading,
    showScanner,
    scannedTag,
    tagAssignment,
    error,
    showErrorModal,
    success,
    showUnassignConfirm,
    isUnassigning,
    // Actions
    startScanning,
    cancelScan,
    scanAnother,
    unassignTag,
    openUnassignConfirm,
    closeUnassignConfirm,
    closeErrorModal,
    showError,
    restoreScan,
    setSuccess,
  };
}
