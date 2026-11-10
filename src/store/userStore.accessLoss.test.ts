import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiCall, setApiErrorCallback } from '../services/apiClient';
import { ApiError } from '../services/apiErrors';

import { useUserStore } from './userStore';

// Issue #512 (IO-4): when the server no longer accepts the kiosk's login,
// the kiosk logs out centrally instead of failing request by request.

const STORED_PIN = '1234';

const loggedInWithSession = () =>
  useUserStore.setState({
    ...useUserStore.getInitialState(),
    authenticatedUser: {
      staffId: 0,
      staffName: 'OGS Device',
      deviceName: 'Kiosk',
      pin: STORED_PIN,
    },
    selectedActivity: {
      id: 1,
      name: 'Nachmittagsbetreuung',
      category: 'OGS',
      category_name: 'OGS',
      room_name: 'Raum 101',
      is_active: true,
      is_occupied: false,
      max_participants: 30,
      enrollment_count: 0,
    },
    selectedRoom: { id: 1, name: 'Raum 101', is_occupied: true },
    currentSession: {
      active_group_id: 100,
      activity_id: 1,
      room_id: 1,
      device_id: 1,
      start_time: '2026-11-09T08:00:00Z',
      duration: '1h',
    },
    selectedSupervisors: [{ id: 7, name: 'Betreuung' }],
  });

const refused = (status: number, code: string, details?: ApiError['details']) =>
  new ApiError(`API Error: ${status}`, status, code, details);

const respondWith = (status: number, body: unknown) => {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  ) as typeof fetch;
};

describe('central logout when the server refuses the login (#512)', () => {
  beforeEach(loggedInWithSession);

  it.each([
    ['the stored PIN', refused(401, 'iot.device_pin_invalid'), 'Die PIN hat sich geändert.'],
    ['an inactive device', refused(403, 'iot.device_inactive'), 'keinen Zugang mehr'],
    ['a revoked device key', refused(401, 'iot.device_api_key_invalid'), 'keinen Zugang mehr'],
    [
      'a school without NFC-Anwesenheit',
      refused(403, 'module.not_booked', { module: 'nfc_anwesenheit' }),
      'Anwesenheit mit Armband ist an dieser Schule nicht gebucht.',
    ],
  ])('logs out after the server refuses %s', (_, error, message) => {
    useUserStore.getState().handleAccessError(error, STORED_PIN);

    const state = useUserStore.getState();
    expect(state.authenticatedUser).toBeNull();
    expect(state.currentSession).toBeNull();
    expect(state.selectedActivity).toBeNull();
    expect(state.selectedRoom).toBeNull();
    expect(state.selectedSupervisors).toEqual([]);
    expect(state.kioskNotice?.title).toBe('Abgemeldet');
    expect(state.kioskNotice?.message).toContain(message);
  });

  it('stays logged in when a PIN typed on the PIN page is wrong', () => {
    useUserStore.getState().handleAccessError(refused(401, 'iot.device_pin_invalid'), '9999');

    expect(useUserStore.getState().authenticatedUser?.pin).toBe(STORED_PIN);
    expect(useUserStore.getState().kioskNotice).toBeNull();
  });

  it.each([
    ['a missing Zeiterfassung', refused(403, 'module.not_booked', { module: 'zeiterfassung' })],
    ['an ordinary refusal', refused(409, 'iot.room_capacity_exceeded')],
    ['a missing session', refused(404, 'iot.no_active_session')],
    ['a plain error', new Error('Keine Netzwerkverbindung.')],
  ])('stays logged in after %s', (_, error) => {
    useUserStore.getState().handleAccessError(error, STORED_PIN);

    expect(useUserStore.getState().authenticatedUser).not.toBeNull();
    expect(useUserStore.getState().currentSession?.active_group_id).toBe(100);
    expect(useUserStore.getState().kioskNotice).toBeNull();
  });

  it('does nothing when nobody is logged in', () => {
    useUserStore.setState({ authenticatedUser: null });

    useUserStore.getState().handleAccessError(refused(403, 'iot.device_inactive'), undefined);

    expect(useUserStore.getState().kioskNotice).toBeNull();
  });
});

describe('apiCall error callback (#512)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setApiErrorCallback(null);
  });

  it('hands every refusal and the request PIN to the registered callback', async () => {
    const callback = vi.fn();
    setApiErrorCallback(callback);
    respondWith(401, { status: 401, code: 'iot.device_pin_invalid', detail: 'invalid staff PIN' });

    await expect(
      apiCall('/api/iot/session/current', { headers: { 'X-Staff-PIN': STORED_PIN } })
    ).rejects.toBeInstanceOf(ApiError);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, requestPin] = callback.mock.calls[0] as [ApiError, string | undefined];
    expect(error.code).toBe('iot.device_pin_invalid');
    expect(requestPin).toBe(STORED_PIN);
  });

  it('logs the kiosk out through the store when the stored PIN is refused', async () => {
    loggedInWithSession();
    setApiErrorCallback(useUserStore.getState().handleAccessError);
    respondWith(401, { status: 401, code: 'iot.device_pin_invalid', detail: 'invalid staff PIN' });

    await expect(
      apiCall('/api/iot/checkin', { method: 'POST', headers: { 'X-Staff-PIN': STORED_PIN } })
    ).rejects.toBeInstanceOf(ApiError);

    expect(useUserStore.getState().authenticatedUser).toBeNull();
  });

  it('still throws the refusal when the callback fails', async () => {
    setApiErrorCallback(() => {
      throw new Error('callback broke');
    });
    respondWith(403, { status: 403, code: 'iot.device_inactive', detail: 'device is not active' });

    await expect(apiCall('/api/iot/teachers')).rejects.toMatchObject({
      code: 'iot.device_inactive',
    });
  });
});
