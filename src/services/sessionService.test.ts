import { describe, expect, it, vi, beforeEach } from 'vitest';

import { api, ApiError, type ActivityResponse, type Room } from './api';
import {
  buildSessionFromStartResponse,
  createSessionRequestTracker,
  isSessionConflictError,
  recreateSession,
  startSessionWithConflictHandling,
} from './sessionService';

vi.mock('./api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    api: {
      ...actual.api,
      startSession: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

const activity: ActivityResponse = {
  id: 10,
  name: 'Hausaufgaben',
  category: 'Betreuung',
};

const room: Room = { id: 5, name: 'Raum A', is_occupied: false };

const startResponse = {
  active_group_id: 42,
  activity_id: 10,
  device_id: 1,
  start_time: '2026-03-15T10:00:00Z',
  supervisors: [
    { staff_id: 1, first_name: 'Anna', last_name: 'Muster', display_name: 'AM', role: 'staff' },
  ],
  status: 'active',
  message: 'Session started',
};

const baseParams = {
  pin: '1234',
  activity,
  room,
  supervisorIds: [1, 2],
};

describe('isSessionConflictError', () => {
  it('detects ApiError with statusCode 409 regardless of message', () => {
    expect(isSessionConflictError(new ApiError('Raum belegt', 409))).toBe(true);
  });

  it('does not flag ApiError with other status codes', () => {
    expect(isSessionConflictError(new ApiError('Interner Fehler', 500))).toBe(false);
  });

  it('falls back to "409" in the message string', () => {
    expect(isSessionConflictError(new Error('HTTP 409: nope'))).toBe(true);
  });

  it('falls back to "Conflict" in the message string', () => {
    expect(isSessionConflictError(new Error('Conflict detected'))).toBe(true);
  });

  it('handles non-Error values via String()', () => {
    expect(isSessionConflictError('409 Conflict')).toBe(true);
    expect(isSessionConflictError('boom')).toBe(false);
  });
});

describe('buildSessionFromStartResponse', () => {
  it('builds CurrentSession from response and local selection', () => {
    expect(buildSessionFromStartResponse(startResponse, activity, room)).toEqual({
      active_group_id: 42,
      activity_id: 10,
      activity_name: 'Hausaufgaben',
      room_id: 5,
      room_name: 'Raum A',
      device_id: 1,
      start_time: '2026-03-15T10:00:00Z',
      duration: '0s',
      is_active: true,
      active_students: 0,
      supervisors: startResponse.supervisors,
    });
  });
});

describe('startSessionWithConflictHandling', () => {
  beforeEach(() => {
    mockedApi.startSession.mockReset();
  });

  it('returns started outcome with built session on success', async () => {
    mockedApi.startSession.mockResolvedValueOnce(startResponse);

    const outcome = await startSessionWithConflictHandling(baseParams);

    expect(mockedApi.startSession).toHaveBeenCalledWith('1234', {
      activity_id: 10,
      room_id: 5,
      supervisor_ids: [1, 2],
    });
    expect(outcome.status).toBe('started');
    if (outcome.status === 'started') {
      expect(outcome.session.active_group_id).toBe(42);
      expect(outcome.response).toBe(startResponse);
    }
  });

  it('returns conflict outcome on 409 without force', async () => {
    const conflictError = new ApiError('Session Konflikt', 409);
    mockedApi.startSession.mockRejectedValueOnce(conflictError);

    const outcome = await startSessionWithConflictHandling(baseParams);

    expect(outcome).toEqual({ status: 'conflict', error: conflictError });
  });

  it('passes force=true to the API and never reports a conflict', async () => {
    const conflictError = new ApiError('Session Konflikt', 409);
    mockedApi.startSession.mockRejectedValueOnce(conflictError);

    const outcome = await startSessionWithConflictHandling({ ...baseParams, force: true });

    expect(mockedApi.startSession).toHaveBeenCalledWith('1234', {
      activity_id: 10,
      room_id: 5,
      supervisor_ids: [1, 2],
      force: true,
    });
    expect(outcome).toEqual({ status: 'error', error: conflictError });
  });

  it('returns error outcome for non-conflict failures', async () => {
    const serverError = new Error('Server kaputt');
    mockedApi.startSession.mockRejectedValueOnce(serverError);

    const outcome = await startSessionWithConflictHandling(baseParams);

    expect(outcome).toEqual({ status: 'error', error: serverError });
  });
});

describe('recreateSession', () => {
  beforeEach(() => {
    mockedApi.startSession.mockReset();
  });

  it('returns started outcome on success', async () => {
    mockedApi.startSession.mockResolvedValueOnce(startResponse);

    const outcome = await recreateSession(baseParams);

    expect(outcome.status).toBe('started');
  });

  it('treats a 409 conflict as a plain error (no conflict special-casing)', async () => {
    const conflictError = new ApiError('Session Konflikt', 409);
    mockedApi.startSession.mockRejectedValueOnce(conflictError);

    const outcome = await recreateSession(baseParams);

    expect(outcome).toEqual({ status: 'error', error: conflictError });
  });
});

describe('createSessionRequestTracker', () => {
  it('marks only the latest request id as current', () => {
    const tracker = createSessionRequestTracker();
    const first = tracker.begin();
    expect(tracker.isCurrent(first)).toBe(true);

    const second = tracker.begin();
    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(true);
  });

  it('invalidate makes all in-flight request ids stale', () => {
    const tracker = createSessionRequestTracker();
    const requestId = tracker.begin();
    tracker.invalidate();
    expect(tracker.isCurrent(requestId)).toBe(false);
  });
});
