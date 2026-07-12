import { createLogger } from '../utils/logger';

import {
  api,
  ApiError,
  type ActivityResponse,
  type CurrentSession,
  type Room,
  type SessionStartRequest,
  type SessionStartResponse,
} from './api';

const logger = createLogger('SessionService');

/**
 * Session lifecycle domain service.
 *
 * Pure functions (no React, no store access) that encapsulate session start,
 * 409 conflict detection, force-start retry and session recreation. Callers
 * (store actions / pages) decide how to reflect the outcomes in UI state.
 */

export interface SessionStartParams {
  pin: string;
  activity: ActivityResponse;
  room: Room;
  supervisorIds: number[];
  /** Retry with force=true to override an existing session after a 409 conflict */
  force?: boolean;
}

export type SessionStartOutcome =
  | { status: 'started'; session: CurrentSession; response: SessionStartResponse }
  | { status: 'conflict'; error: unknown }
  | { status: 'error'; error: unknown };

export type SessionRecreationOutcome =
  | { status: 'success'; session: CurrentSession; stale: boolean }
  | { status: 'incomplete'; stale: boolean }
  | { status: 'error'; error: unknown; stale: boolean };

export type SessionValidationOutcome =
  { status: 'success' } | { status: 'error' } | { status: 'stale' };

/**
 * Detect a session conflict (HTTP 409) via ApiError.statusCode with the
 * historical message-string check as fallback.
 */
export function isSessionConflictError(error: unknown): boolean {
  if (error instanceof ApiError && error.statusCode === 409) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('409') || message.includes('Conflict');
}

/**
 * Build a CurrentSession from the start response + local selection instead of
 * making a redundant GET /api/iot/session/current round-trip.
 */
export function buildSessionFromStartResponse(
  response: SessionStartResponse,
  activity: ActivityResponse,
  room: Room
): CurrentSession {
  return {
    active_group_id: response.active_group_id,
    activity_id: response.activity_id,
    activity_name: activity.name,
    room_id: room.id,
    room_name: room.name,
    device_id: response.device_id,
    start_time: response.start_time,
    duration: '0s',
    is_active: true,
    active_students: 0,
    supervisors: response.supervisors,
  };
}

/**
 * Start a session and classify the outcome: started, 409 conflict, or error.
 * With force=true a conflict is never reported; every failure is an error,
 * matching the historical force-start retry behavior.
 */
export async function startSessionWithConflictHandling(
  params: SessionStartParams
): Promise<SessionStartOutcome> {
  const { pin, activity, room, supervisorIds, force } = params;

  const request: SessionStartRequest = {
    activity_id: activity.id,
    room_id: room.id,
    supervisor_ids: supervisorIds,
    ...(force ? { force: true } : {}),
  };

  try {
    const response = await api.startSession(pin, request);
    return {
      status: 'started',
      response,
      session: buildSessionFromStartResponse(response, activity, room),
    };
  } catch (error) {
    if (!force && isSessionConflictError(error)) {
      logger.info('Session start rejected with conflict', {
        activityId: activity.id,
        roomId: room.id,
      });
      return { status: 'conflict', error };
    }
    return { status: 'error', error };
  }
}

/**
 * Recreate a previously saved session. Conflicts are not special-cased here;
 * recreation treats every failure as a plain error (historical behavior).
 */
export async function recreateSession(params: {
  pin: string;
  activity: ActivityResponse;
  room: Room;
  supervisorIds: number[];
}): Promise<
  | { status: 'started'; session: CurrentSession; response: SessionStartResponse }
  | { status: 'error'; error: unknown }
> {
  const outcome = await startSessionWithConflictHandling(params);
  if (outcome.status === 'started') {
    return outcome;
  }
  return { status: 'error', error: outcome.error };
}

export interface SessionRequestTracker {
  /** Register a new session operation and return its request id */
  begin(): number;
  /** True while the given request id is still the latest attempt */
  isCurrent(requestId: number): boolean;
  /** Invalidate all in-flight attempts (e.g. on logout) */
  invalidate(): void;
}

/**
 * Race guard for asynchronous session operations: each attempt gets a monotonically
 * increasing request id; responses whose id is no longer current are stale
 * and must be discarded by the caller.
 */
export function createSessionRequestTracker(): SessionRequestTracker {
  let latestRequestId = 0;
  return {
    begin: () => {
      latestRequestId += 1;
      return latestRequestId;
    },
    isCurrent: requestId => requestId === latestRequestId,
    invalidate: () => {
      latestRequestId += 1;
    },
  };
}
