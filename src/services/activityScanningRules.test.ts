import { describe, expect, it } from 'vitest';

import {
  CHECKIN_WITH_PICKUP_TIME_TIMEOUT_MS,
  DAILY_CHECKOUT_TIMEOUT_MS,
  FAREWELL_TIMEOUT_MS,
  PICKUP_QUERY_RESULT_TIMEOUT_MS,
  createPickupQueryTimeoutResult,
  getCheckinCountDelta,
  getCheckoutCountDelta,
  getModalTimeoutDuration,
  getTransferCountDelta,
  isNonActionableScan,
  shouldApplyAuthoritativeCount,
  type ExtendedScanResult,
  type ModalTimeoutParams,
} from './activityScanningRules';

const makeScan = (overrides: Partial<ExtendedScanResult> = {}): ExtendedScanResult => ({
  student_id: 42,
  student_name: 'Max Mustermann',
  action: 'checked_in',
  ...overrides,
});

describe('getCheckinCountDelta', () => {
  it('increments for a regular check-in', () => {
    expect(getCheckinCountDelta(makeScan())).toBe(1);
  });

  it('does not count Schulhof check-ins', () => {
    expect(getCheckinCountDelta(makeScan({ isSchulhof: true }))).toBe(0);
  });

  it('does not count Toilette check-ins', () => {
    expect(getCheckinCountDelta(makeScan({ isToilette: true }))).toBe(0);
  });
});

describe('getCheckoutCountDelta', () => {
  it('always decrements', () => {
    expect(getCheckoutCountDelta()).toBe(-1);
  });
});

describe('getTransferCountDelta', () => {
  it('increments when the student transfers into our room', () => {
    const scan = makeScan({ action: 'transferred', room_name: 'Raum 101' });
    expect(getTransferCountDelta(scan, 'Raum 101')).toBe(1);
  });

  it('decrements when the student transfers out of our room', () => {
    const scan = makeScan({
      action: 'transferred',
      room_name: 'Raum 202',
      previous_room: 'Raum 101',
    });
    expect(getTransferCountDelta(scan, 'Raum 101')).toBe(-1);
  });

  it('returns 0 when the transfer does not involve our room', () => {
    const scan = makeScan({
      action: 'transferred',
      room_name: 'Raum 202',
      previous_room: 'Raum 303',
    });
    expect(getTransferCountDelta(scan, 'Raum 101')).toBe(0);
  });

  it('returns 0 when the current room name is undefined but previous_room is set', () => {
    const scan = makeScan({
      action: 'transferred',
      room_name: 'Raum 202',
      previous_room: 'Raum 303',
    });
    expect(getTransferCountDelta(scan, undefined)).toBe(0);
  });

  it('decrements when previous_room and current room name are both undefined', () => {
    // Mirrors today's behavior: undefined === undefined matches the outgoing branch.
    const scan = makeScan({ action: 'transferred', room_name: 'Raum 202' });
    expect(getTransferCountDelta(scan, undefined)).toBe(-1);
  });
});

describe('isNonActionableScan', () => {
  it('is true for error results', () => {
    expect(isNonActionableScan(makeScan({ showAsError: true }))).toBe(true);
  });

  it('is true for info results', () => {
    expect(isNonActionableScan(makeScan({ isInfo: true }))).toBe(true);
  });

  it('is false for regular scan results', () => {
    expect(isNonActionableScan(makeScan())).toBe(false);
  });
});

describe('shouldApplyAuthoritativeCount', () => {
  it('is true when the server provides active_students', () => {
    expect(shouldApplyAuthoritativeCount(makeScan({ active_students: 7 }))).toBe(true);
  });

  it('is true when active_students is 0', () => {
    expect(shouldApplyAuthoritativeCount(makeScan({ active_students: 0 }))).toBe(true);
  });

  it('is false when active_students is missing', () => {
    expect(shouldApplyAuthoritativeCount(makeScan())).toBe(false);
  });

  it('is false for Schulhof scans (count refers to the Schulhof room)', () => {
    expect(shouldApplyAuthoritativeCount(makeScan({ active_students: 7, isSchulhof: true }))).toBe(
      false
    );
  });

  it('is false for Toilette scans (count refers to the WC room)', () => {
    expect(shouldApplyAuthoritativeCount(makeScan({ active_students: 7, isToilette: true }))).toBe(
      false
    );
  });
});

describe('getModalTimeoutDuration', () => {
  const baseParams: ModalTimeoutParams = {
    isPickupQueryLoading: false,
    isAwaitingPickupQueryScan: false,
    showingFarewell: false,
    hasCheckoutDestination: false,
    showFeedbackPrompt: false,
    scanAction: undefined,
    hasPickupTime: false,
    scanTimeout: 3000,
    modalDisplayTime: 1500,
  };

  it('uses the scan timeout while a pickup query is loading', () => {
    expect(getModalTimeoutDuration({ ...baseParams, isPickupQueryLoading: true })).toBe(3000);
  });

  it('uses the scan timeout while awaiting a pickup query scan', () => {
    expect(getModalTimeoutDuration({ ...baseParams, isAwaitingPickupQueryScan: true })).toBe(3000);
  });

  it('uses the farewell timeout when showing a farewell message', () => {
    expect(
      getModalTimeoutDuration({
        ...baseParams,
        showingFarewell: true,
        hasCheckoutDestination: true,
      })
    ).toBe(FAREWELL_TIMEOUT_MS);
  });

  it('uses the daily checkout timeout for the destination selection', () => {
    expect(getModalTimeoutDuration({ ...baseParams, hasCheckoutDestination: true })).toBe(
      DAILY_CHECKOUT_TIMEOUT_MS
    );
  });

  it('uses the daily checkout timeout for the feedback prompt', () => {
    expect(getModalTimeoutDuration({ ...baseParams, showFeedbackPrompt: true })).toBe(
      DAILY_CHECKOUT_TIMEOUT_MS
    );
  });

  it('uses the pickup query result timeout for pickup_info results', () => {
    expect(getModalTimeoutDuration({ ...baseParams, scanAction: 'pickup_info' })).toBe(
      PICKUP_QUERY_RESULT_TIMEOUT_MS
    );
  });

  it('uses the extended check-in timeout when a pickup time is shown', () => {
    expect(
      getModalTimeoutDuration({ ...baseParams, scanAction: 'checked_in', hasPickupTime: true })
    ).toBe(CHECKIN_WITH_PICKUP_TIME_TIMEOUT_MS);
  });

  it('uses the configured display time for a check-in without pickup time', () => {
    expect(getModalTimeoutDuration({ ...baseParams, scanAction: 'checked_in' })).toBe(1500);
  });

  it('uses the configured display time for normal scans', () => {
    expect(getModalTimeoutDuration({ ...baseParams, scanAction: 'checked_out' })).toBe(1500);
  });

  it('prioritizes pickup query loading over farewell and destination states', () => {
    expect(
      getModalTimeoutDuration({
        ...baseParams,
        isPickupQueryLoading: true,
        showingFarewell: true,
        hasCheckoutDestination: true,
        showFeedbackPrompt: true,
      })
    ).toBe(3000);
  });

  it('prioritizes farewell over the destination selection timeout', () => {
    expect(
      getModalTimeoutDuration({
        ...baseParams,
        showingFarewell: true,
        hasCheckoutDestination: true,
        showFeedbackPrompt: true,
      })
    ).toBe(FAREWELL_TIMEOUT_MS);
  });

  it('prioritizes the destination selection over pickup_info results', () => {
    expect(
      getModalTimeoutDuration({
        ...baseParams,
        hasCheckoutDestination: true,
        scanAction: 'pickup_info',
      })
    ).toBe(DAILY_CHECKOUT_TIMEOUT_MS);
  });
});

describe('createPickupQueryTimeoutResult', () => {
  it('builds the timeout error result', () => {
    expect(createPickupQueryTimeoutResult()).toEqual({
      student_name: 'Abholzeit konnte nicht geladen werden',
      student_id: null,
      action: 'error',
      message: 'Zeitüberschreitung beim Laden der Abholzeit. Bitte erneut scannen.',
      showAsError: true,
    });
  });
});
