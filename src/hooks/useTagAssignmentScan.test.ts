import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, type TagAssignmentCheck } from '../services/api';
import { useUserStore } from '../store/userStore';

import { useTagAssignmentScan } from './useTagAssignmentScan';

// Mock the platform adapter
vi.mock('@platform', () => ({
  adapter: {
    platform: 'browser',
    scanSingleTag: vi.fn(),
  },
}));

const { adapter } = await import('@platform');
const mockScanSingleTag = vi.mocked(adapter.scanSingleTag);

// Mock crypto utility (getSecureRandomInt) to always return 0 for determinism
vi.mock('../utils/crypto', () => ({
  getSecureRandomInt: vi.fn(() => 0),
}));

/** Reusable authenticated user fixture */
const baseUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  pin: '1234',
};

const assignedStudentTag: TagAssignmentCheck = {
  assigned: true,
  person_type: 'student',
  person: {
    id: 1,
    person_id: 100,
    name: 'Max Mustermann',
    group: 'Klasse 3a',
  },
};

const assignedStaffTag: TagAssignmentCheck = {
  assigned: true,
  person_type: 'staff',
  person: {
    id: 5,
    person_id: 50,
    name: 'Frau Mueller',
    group: 'Staff',
  },
};

const unassignedTag: TagAssignmentCheck = {
  assigned: false,
};

const setPlatform = (platform: string) => {
  (adapter as unknown as Record<string, unknown>).platform = platform;
};

describe('useTagAssignmentScan', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useUserStore.setState({
      authenticatedUser: baseUser,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    setPlatform('browser');
    vi.restoreAllMocks();
  });

  // =======================================================================
  // Timeout (real scanning)
  // =======================================================================

  it('shows timeout error when the scanner does not respond within 20s', async () => {
    setPlatform('gkt');
    // Scanner never resolves -> the frontend withTimeout safety net must fire
    mockScanSingleTag.mockImplementation(() => new Promise(() => {}));
    const checkSpy = vi.spyOn(api, 'checkTagAssignment');

    const { result } = renderHook(() => useTagAssignmentScan());

    act(() => {
      void result.current.startScanning();
    });
    expect(result.current.showScanner).toBe(true);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(result.current.error).toBe(
      'Scanner reagiert nicht mehr. Bitte Scanner neu starten und erneut versuchen.'
    );
    expect(result.current.showErrorModal).toBe(true);
    expect(result.current.showScanner).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(checkSpy).not.toHaveBeenCalled();
  });

  // =======================================================================
  // Cancellation during scan
  // =======================================================================

  it('ignores a real scan result that arrives after cancellation', async () => {
    setPlatform('gkt');
    let resolveScan: (value: {
      success: boolean;
      tag_id?: string;
      error?: string;
    }) => void = () => {};
    mockScanSingleTag.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveScan = resolve;
        })
    );
    const checkSpy = vi.spyOn(api, 'checkTagAssignment').mockResolvedValue(unassignedTag);

    const { result } = renderHook(() => useTagAssignmentScan());

    act(() => {
      void result.current.startScanning();
    });
    expect(result.current.showScanner).toBe(true);

    act(() => {
      result.current.cancelScan();
    });
    expect(result.current.showScanner).toBe(false);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      resolveScan({ success: true, tag_id: '04:D6:94:82:97:6A:80' });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(checkSpy).not.toHaveBeenCalled();
    expect(result.current.scannedTag).toBeNull();
    expect(result.current.tagAssignment).toBeNull();
  });

  it('does not process a mock scan result after cancellation', async () => {
    setPlatform('browser');
    const checkSpy = vi.spyOn(api, 'checkTagAssignment').mockResolvedValue(unassignedTag);

    const { result } = renderHook(() => useTagAssignmentScan());

    act(() => {
      void result.current.startScanning();
    });
    expect(result.current.showScanner).toBe(true);

    act(() => {
      result.current.cancelScan();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(checkSpy).not.toHaveBeenCalled();
    expect(result.current.scannedTag).toBeNull();
    expect(result.current.showScanner).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  // =======================================================================
  // Mock mode (browser platform)
  // =======================================================================

  it('completes a mock scan after 2s without calling the platform scanner', async () => {
    setPlatform('browser');
    const checkSpy = vi.spyOn(api, 'checkTagAssignment').mockResolvedValue(unassignedTag);

    const { result } = renderHook(() => useTagAssignmentScan());

    act(() => {
      void result.current.startScanning();
    });
    expect(result.current.showScanner).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => {
      expect(result.current.tagAssignment).toEqual(unassignedTag);
    });
    expect(checkSpy).toHaveBeenCalledWith('1234', expect.any(String));
    expect(mockScanSingleTag).not.toHaveBeenCalled();
    expect(result.current.scannedTag).toEqual(expect.any(String));
    expect(result.current.showScanner).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  // =======================================================================
  // Unassign: student vs. staff
  // =======================================================================

  it('unassigns a student tag via api.unassignStudentTag', async () => {
    const clearTagScanSpy = vi.fn();
    useUserStore.setState({
      authenticatedUser: baseUser,
      clearTagScan: clearTagScanSpy,
    });
    const unassignStudentSpy = vi.spyOn(api, 'unassignStudentTag').mockResolvedValue({
      success: true,
      message: 'Tag removed',
    });
    const unassignStaffSpy = vi.spyOn(api, 'unassignStaffTag');

    const { result } = renderHook(() => useTagAssignmentScan());

    act(() => {
      result.current.restoreScan('04:D6:94:82:97:6A:80', assignedStudentTag);
    });

    await act(async () => {
      await result.current.unassignTag();
    });

    expect(unassignStudentSpy).toHaveBeenCalledWith('1234', 1);
    expect(unassignStaffSpy).not.toHaveBeenCalled();
    expect(clearTagScanSpy).toHaveBeenCalledWith('04:D6:94:82:97:6A:80');
    expect(result.current.success).toBe('Armband wurde von Max Mustermann entfernt');
    expect(result.current.scannedTag).toBeNull();
    expect(result.current.tagAssignment).toBeNull();
  });

  it('unassigns a staff tag via api.unassignStaffTag', async () => {
    const clearTagScanSpy = vi.fn();
    useUserStore.setState({
      authenticatedUser: baseUser,
      clearTagScan: clearTagScanSpy,
    });
    const unassignStudentSpy = vi.spyOn(api, 'unassignStudentTag');
    const unassignStaffSpy = vi.spyOn(api, 'unassignStaffTag').mockResolvedValue({
      success: true,
      message: 'Staff tag removed',
    });

    const { result } = renderHook(() => useTagAssignmentScan());

    act(() => {
      result.current.restoreScan('04:D6:94:82:97:6A:80', assignedStaffTag);
    });

    await act(async () => {
      await result.current.unassignTag();
    });

    expect(unassignStaffSpy).toHaveBeenCalledWith('1234', 5);
    expect(unassignStudentSpy).not.toHaveBeenCalled();
    expect(clearTagScanSpy).toHaveBeenCalledWith('04:D6:94:82:97:6A:80');
    expect(result.current.success).toBe('Armband wurde von Frau Mueller entfernt');
    expect(result.current.scannedTag).toBeNull();
    expect(result.current.tagAssignment).toBeNull();
  });
});
