import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSchoolName, onSchoolNameLoaded } from '../services/api';

import { useSchoolName } from './useSchoolName';

vi.mock('../services/api', () => ({
  getSchoolName: vi.fn(() => null),
  onSchoolNameLoaded: vi.fn(() => () => {}),
}));

const mockGetSchoolName = vi.mocked(getSchoolName);
const mockOnSchoolNameLoaded = vi.mocked(onSchoolNameLoaded);

describe('useSchoolName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSchoolName.mockReturnValue(null);
    mockOnSchoolNameLoaded.mockReturnValue(() => {});
  });

  it('returns the school name directly when it is already loaded', () => {
    mockGetSchoolName.mockReturnValue('Testschule');

    const { result } = renderHook(() => useSchoolName());

    expect(result.current).toBe('Testschule');
    expect(mockOnSchoolNameLoaded).not.toHaveBeenCalled();
  });

  it('subscribes and updates when the name arrives after mount', () => {
    let listener: ((name: string) => void) | null = null;
    mockOnSchoolNameLoaded.mockImplementation(cb => {
      listener = cb;
      return () => {};
    });

    const { result } = renderHook(() => useSchoolName());
    expect(result.current).toBeNull();
    expect(mockOnSchoolNameLoaded).toHaveBeenCalledTimes(1);

    act(() => listener!('Grundschule Musterstadt'));
    expect(result.current).toBe('Grundschule Musterstadt');
  });

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    mockOnSchoolNameLoaded.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useSchoolName());
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
