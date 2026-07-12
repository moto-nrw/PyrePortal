import type { RfidScanResult } from '../../services/api';
import { createLogger } from '../../utils/logger';
import type { GetState, SetState, UserState } from '../userStore';

import type { User } from './authSlice';

// Create a store-specific logger instance
const storeLogger = createLogger('UserStore');

// Recent tag scan tracking
export interface RecentTagScan {
  timestamp: number;
  studentId?: string;
  result?: RfidScanResult;
  syncPromise?: Promise<void>; // Background sync promise (for race condition prevention)
}

type RfidScanMode = 'checkin' | 'pickupQuery';

// Cache TTL for recentTagScans. This is NOT a dedup window — dedup is handled by
// scanId (adapter-level) + processingQueue (Layer 1).
// recentTagScans only exists as a short-lived cache for result replay and syncPromise.
export const RECENT_SCAN_CACHE_TTL_MS = 10_000;

// RFID scanning state
export interface RfidState {
  isScanning: boolean;
  currentScan: RfidScanResult | null;
  scanTimeout: number; // 3 seconds default
  modalDisplayTime: number; // 1.5 seconds default
  showModal: boolean;
  scanMode: RfidScanMode;
  scanContextId: number;
  pickupQueryTagId: string | null;

  // Duplicate prevention state
  processingQueue: Set<string>; // Currently processing tag IDs
  recentTagScans: Map<string, RecentTagScan>; // Short-lived result cache by tagId
}

// RFID state that should be cleared on session change
export const RFID_SESSION_INITIAL_STATE = {
  recentTagScans: new Map<string, RecentTagScan>(),
  processingQueue: new Set<string>(),
  scanMode: 'checkin' as RfidScanMode,
  scanContextId: 0,
  pickupQueryTagId: null as string | null,
};

export const createScanSlice = (set: SetState<UserState>, get: GetState<UserState>) => ({
  activeSupervisorTags: new Set<string>(),

  // RFID initial state
  rfid: {
    isScanning: false,
    currentScan: null,
    scanTimeout: 3000, // 3 seconds
    modalDisplayTime: 1500, // 1.5 seconds - fast turnover for kiosk queues
    showModal: false,
    scanMode: 'checkin' as RfidScanMode,
    scanContextId: 0,
    pickupQueryTagId: null,

    // Duplicate prevention state
    processingQueue: new Set<string>(),
    recentTagScans: new Map<string, RecentTagScan>(),
  },

  addSupervisorFromRfid: (staffId: number, staffName: string) => {
    const { selectedSupervisors } = get();
    const isAlreadySelected = selectedSupervisors.some(s => s.id === staffId);

    if (isAlreadySelected) {
      storeLogger.info('Supervisor already in selectedSupervisors via RFID', {
        staffId,
        staffName,
      });
      return true; // Already present - second scan
    }

    const newSupervisor: User = { id: staffId, name: staffName };
    set({
      selectedSupervisors: [...selectedSupervisors, newSupervisor],
      activeSupervisorTags: new Set<string>(),
    });

    storeLogger.info('Supervisor added to selectedSupervisors via RFID', {
      staffId,
      staffName,
      totalSupervisors: selectedSupervisors.length + 1,
    });

    return false; // Was not present - first scan
  },

  addActiveSupervisorTag: (tagId: string) => {
    set(state => {
      const updatedTags = new Set(state.activeSupervisorTags);
      updatedTags.add(tagId);
      return { activeSupervisorTags: updatedTags };
    });
    storeLogger.debug('RFID tag saved for supervisor', { tagId });
  },

  isActiveSupervisor: (tagId: string) => {
    return get().activeSupervisorTags.has(tagId);
  },

  // RFID actions
  startRfidScanning: () => {
    set(state => ({
      rfid: { ...state.rfid, isScanning: true },
    }));
  },

  stopRfidScanning: () => {
    set(state => ({
      rfid: { ...state.rfid, isScanning: false, currentScan: null },
    }));
  },

  setScanResult: (result: RfidScanResult | null) => {
    set(state => ({
      rfid: { ...state.rfid, currentScan: result },
    }));
  },

  showScanModal: () => {
    set(state => ({
      rfid: { ...state.rfid, showModal: true },
    }));
  },

  hideScanModal: () => {
    set(state => ({
      rfid: { ...state.rfid, showModal: false, currentScan: null },
    }));
  },

  startPickupQueryMode: () => {
    set(state => ({
      rfid: {
        ...state.rfid,
        scanMode: 'pickupQuery' as RfidScanMode,
        scanContextId: state.rfid.scanContextId + 1,
        pickupQueryTagId: null,
      },
    }));
  },

  lockPickupQueryTag: (tagId: string) => {
    set(state => ({
      rfid: {
        ...state.rfid,
        pickupQueryTagId: state.rfid.pickupQueryTagId ?? tagId,
      },
    }));
  },

  resetScanMode: () => {
    set(state => ({
      rfid: {
        ...state.rfid,
        scanMode: 'checkin' as RfidScanMode,
        scanContextId: state.rfid.scanContextId + 1,
        pickupQueryTagId: null,
      },
    }));
  },

  // Duplicate prevention bookkeeping actions
  addToProcessingQueue: (tagId: string) => {
    set(state => {
      const newQueue = new Set(state.rfid.processingQueue);
      newQueue.add(tagId);
      return {
        rfid: { ...state.rfid, processingQueue: newQueue },
      };
    });
  },

  removeFromProcessingQueue: (tagId: string) => {
    set(state => {
      const newQueue = new Set(state.rfid.processingQueue);
      newQueue.delete(tagId);
      return {
        rfid: { ...state.rfid, processingQueue: newQueue },
      };
    });
  },

  // Enhanced duplicate prevention functions
  canProcessTag: (tagId: string) => {
    const { rfid } = get();

    // Layer 1: Check if tag is currently being processed
    if (rfid.processingQueue.has(tagId)) {
      return false;
    }

    // Layer 2 (scanId-based) is handled in onAdapterScan before this function is called.
    // recentTagScans is a cache, not a dedup gate.

    return true;
  },

  recordTagScan: (tagId: string, scan: RecentTagScan) => {
    set(state => {
      const newScans = new Map(state.rfid.recentTagScans);
      newScans.set(tagId, scan);
      return {
        rfid: { ...state.rfid, recentTagScans: newScans },
      };
    });
  },

  clearTagScan: (tagId: string) => {
    set(state => {
      const newScans = new Map(state.rfid.recentTagScans);
      newScans.delete(tagId);

      return {
        rfid: { ...state.rfid, recentTagScans: newScans },
      };
    });
  },

  clearOldTagScans: () => {
    set(state => {
      const now = Date.now();
      const newScans = new Map<string, RecentTagScan>();

      // Purge stale cache entries
      state.rfid.recentTagScans.forEach((scan, tagId) => {
        if (now - scan.timestamp < RECENT_SCAN_CACHE_TTL_MS) {
          newScans.set(tagId, scan);
        }
      });

      return {
        rfid: { ...state.rfid, recentTagScans: newScans },
      };
    });
  },
});
