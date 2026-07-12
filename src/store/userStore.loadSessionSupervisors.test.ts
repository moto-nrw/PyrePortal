import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api, type CurrentSession } from '../services/api';

import { useUserStore } from './userStore';

vi.mock('../services/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getCurrentSession: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

const baseUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  pin: '1234',
};

const sessionWithSupervisors: CurrentSession = {
  active_group_id: 42,
  activity_id: 10,
  activity_name: 'Hausaufgaben',
  room_id: 5,
  room_name: 'Raum A',
  device_id: 1,
  start_time: '2026-03-15T10:00:00Z',
  duration: '01:30:00',
  is_active: true,
  active_students: 12,
  supervisors: [
    {
      staff_id: 1,
      first_name: 'Anna',
      last_name: 'Müller',
      display_name: 'Frau Müller',
      role: 'teacher',
    },
    {
      staff_id: 2,
      first_name: 'Peter',
      last_name: 'Schmidt',
      display_name: 'Herr Schmidt',
      role: 'teacher',
    },
  ],
};

describe('loadSessionSupervisors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({
      authenticatedUser: baseUser,
      selectedSupervisors: [],
    });
  });

  it('maps session supervisors into the local supervisor selection', async () => {
    mockedApi.getCurrentSession.mockResolvedValue(sessionWithSupervisors);

    await useUserStore.getState().loadSessionSupervisors();

    expect(mockedApi.getCurrentSession).toHaveBeenCalledWith('1234');
    expect(useUserStore.getState().selectedSupervisors).toEqual([
      { id: 1, name: 'Frau Müller' },
      { id: 2, name: 'Herr Schmidt' },
    ]);
  });

  it('sets an empty selection when the supervisors key exists but is undefined', async () => {
    useUserStore.setState({ selectedSupervisors: [{ id: 9, name: 'Alt' }] });
    mockedApi.getCurrentSession.mockResolvedValue({
      ...sessionWithSupervisors,
      supervisors: undefined,
    });

    await useUserStore.getState().loadSessionSupervisors();

    expect(useUserStore.getState().selectedSupervisors).toEqual([]);
  });

  it('leaves the selection untouched when the response has no supervisors key', async () => {
    useUserStore.setState({ selectedSupervisors: [{ id: 9, name: 'Alt' }] });
    const { supervisors: _ignored, ...withoutSupervisorsKey } = sessionWithSupervisors;
    mockedApi.getCurrentSession.mockResolvedValue(withoutSupervisorsKey);

    await useUserStore.getState().loadSessionSupervisors();

    expect(useUserStore.getState().selectedSupervisors).toEqual([{ id: 9, name: 'Alt' }]);
  });

  it('leaves the selection untouched when no session is active', async () => {
    useUserStore.setState({ selectedSupervisors: [{ id: 9, name: 'Alt' }] });
    mockedApi.getCurrentSession.mockResolvedValue(null);

    await useUserStore.getState().loadSessionSupervisors();

    expect(useUserStore.getState().selectedSupervisors).toEqual([{ id: 9, name: 'Alt' }]);
  });

  it('does not call the API without an authenticated user', async () => {
    useUserStore.setState({ authenticatedUser: null });

    await useUserStore.getState().loadSessionSupervisors();

    expect(mockedApi.getCurrentSession).not.toHaveBeenCalled();
  });

  it('propagates API errors to the caller', async () => {
    mockedApi.getCurrentSession.mockRejectedValue(new Error('Network error'));

    await expect(useUserStore.getState().loadSessionSupervisors()).rejects.toThrow('Network error');
  });
});
