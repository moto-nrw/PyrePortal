import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiCall } from './apiClient';

// Production persists INFO and above to the device log; DEBUG stays out.
const { logCalls } = vi.hoisted(() => ({
  logCalls: [] as { level: string; message: string; data?: unknown }[],
}));

vi.mock('../utils/logger', () => {
  const record = (level: string) => (message: string, data?: unknown) => {
    logCalls.push({ level, message, data });
  };
  return {
    createLogger: vi.fn(() => ({
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
    })),
  };
});

const TAG = '04:AA:BB:CC:DD:EE:FF';

const persistedLogText = () => JSON.stringify(logCalls.filter(call => call.level !== 'debug'));

const respondWith = (status: number, body: unknown) => {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  ) as typeof fetch;
};

describe('apiCall device log', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    logCalls.length = 0;
  });

  it('logs a failed tag lookup with an endpoint template instead of the tag ID', async () => {
    respondWith(404, { code: 'RFID_TAG_NOT_FOUND', detail: 'tag not found' });

    await expect(apiCall(`/api/iot/rfid/${TAG}`)).rejects.toThrow();

    expect(persistedLogText()).not.toContain(TAG);
    expect(logCalls).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: 'API request failed',
        data: expect.objectContaining({ endpoint: '/api/iot/rfid/:id', status: 404 }),
      })
    );
  });

  it('masks person IDs in paths and drops query strings', async () => {
    respondWith(500, {});

    await expect(apiCall('/api/students/98765/rfid')).rejects.toThrow();
    await expect(apiCall('/api/iot/students?teacher_ids=11,12')).rejects.toThrow();

    const endpoints = logCalls
      .filter(call => call.level === 'warn')
      .map(call => (call.data as { endpoint: string }).endpoint);
    expect(endpoints).toEqual(['/api/students/:id/rfid', '/api/iot/students']);
  });

  it('keeps student details of an already active visit out of persisted levels', async () => {
    respondWith(409, {
      code: 'STUDENT_ALREADY_ACTIVE',
      details: { student_id: 98765, student_name: 'Mila Beispiel', room_name: 'Raum A' },
    });

    await expect(apiCall('/api/iot/checkin', { method: 'POST' })).rejects.toThrow();

    expect(persistedLogText()).not.toContain('Mila');
    expect(persistedLogText()).not.toContain('98765');
    expect(logCalls).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        data: expect.objectContaining({
          errorCode: 'STUDENT_ALREADY_ACTIVE',
          errorDetailFields: ['student_id', 'student_name', 'room_name'],
        }),
      })
    );
  });
});
