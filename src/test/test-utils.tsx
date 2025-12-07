/**
 * Test Utilities for PyrePortal
 *
 * Provides helper functions and mock factories for testing React components
 * with Zustand store and React Router dependencies.
 */

import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import type { ActivityResponse, Room, RfidScanResult } from '../services/api';

/**
 * Mock authenticated user data
 */
export const mockAuthenticatedUser = {
  staffId: 1,
  staffName: 'Test Teacher',
  deviceName: 'Test Device',
  pin: '1234',
};

/**
 * Mock activity data
 */
export const mockActivity: ActivityResponse = {
  id: 1,
  name: 'Test Activity',
  category: 'default',
  max_participants: 20,
  enrollment_count: 5,
  room_name: 'Test Room',
  is_active: true,
};

/**
 * Mock room data
 */
export const mockRoom: Room = {
  id: 1,
  name: 'Test Room',
  room_type: 'activity',
  capacity: 20,
  is_occupied: false,
};

/**
 * Mock Schulhof room - used for testing Schulhof detection logic
 */
export const mockSchulhofRoom: Room = {
  id: 99,
  name: 'Schulhof',
  room_type: 'outdoor',
  capacity: 100,
  category: 'outdoor',
  is_occupied: false,
};

/**
 * Mock RFID state
 */
export const mockRfidState = {
  isScanning: false,
  showModal: false,
  currentScan: null as RfidScanResult | null,
  processingQueue: new Set<string>(),
  blockedTags: new Map<string, number>(),
  modalDisplayTime: 3000,
  recentTagScans: new Map(),
  tagToStudentMap: new Map(),
};

/**
 * Create mock RFID scan result
 */
export function createMockScanResult(overrides: Partial<RfidScanResult> = {}): RfidScanResult {
  return {
    student_name: 'Test Student',
    student_id: 123,
    action: 'checked_in',
    message: undefined,
    room_name: 'Test Room',
    previous_room: undefined,
    ...overrides,
  };
}

/**
 * Create mock rooms list with optional Schulhof
 */
export function createMockRooms(includeSchulhof = true): Room[] {
  const rooms: Room[] = [
    { id: 1, name: 'Classroom A', room_type: 'classroom', is_occupied: false },
    { id: 2, name: 'Classroom B', room_type: 'classroom', is_occupied: false },
    { id: 3, name: 'Art Room', room_type: 'activity', is_occupied: false },
  ];

  if (includeSchulhof) {
    rooms.push({
      id: 99,
      name: 'Schulhof',
      room_type: 'outdoor',
      category: 'outdoor',
      is_occupied: false,
    });
  }

  return rooms;
}

/**
 * Wrapper component with all required providers
 */
interface AllProvidersProps {
  children: ReactNode;
  initialEntries?: string[];
}

function AllProviders({ children, initialEntries = ['/'] }: AllProvidersProps) {
  return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
}

/**
 * Custom render function with all providers
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
}

export function renderWithProviders(
  ui: ReactElement,
  { initialEntries, ...renderOptions }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <AllProviders initialEntries={initialEntries}>{children}</AllProviders>;
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react';
export { renderWithProviders as render };
