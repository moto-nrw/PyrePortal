import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { StoreApi } from 'zustand';

import { LogLevel, createLogger } from './logger';

// Re-mock createLogger to let us control wouldLog per test
const mockWouldLog = vi.fn((_level?: number) => false);
const mockDebug = vi.fn();
const mockInfo = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();

vi.mocked(createLogger).mockReturnValue({
  debug: mockDebug,
  info: mockInfo,
  warn: mockWarn,
  error: mockError,
  wouldLog: mockWouldLog,
  updateConfig: vi.fn(),
  getInMemoryLogs: vi.fn(() => []),
  clearInMemoryLogs: vi.fn(),
  exportLogs: vi.fn(() => '[]'),
} as never);

const { loggerMiddleware } = await import('./storeMiddleware');

type TestState = Record<string, unknown>;
type SetState = (
  partial: Partial<TestState> | ((state: TestState) => Partial<TestState>),
  replace?: false
) => void;
type GetState = () => TestState;
type StateCreator = (set: SetState, get: GetState, api: StoreApi<TestState>) => TestState;

/** Create a minimal fake Zustand store to exercise the middleware. */
function createFakeStore(creator: StateCreator, options?: Parameters<typeof loggerMiddleware>[1]) {
  let state: TestState = {};
  const api = {} as StoreApi<TestState>;

  const get: GetState = () => state;
  const set: SetState = partial => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };

  const wrapped = loggerMiddleware(creator, options);
  state = wrapped(set, get, api);
  return { get, set: (p: Partial<TestState>) => (state.wrappedSet as SetState)(p) };
}

/** Helper to build a store that exposes the enhanced set function. */
function buildStore(initial: TestState, options?: Parameters<typeof loggerMiddleware>[1]) {
  const store = createFakeStore(
    (set, get) => ({
      ...initial,
      wrappedSet: (p: Partial<TestState>) => set(p),
      wrappedSetFn: (fn: (s: TestState) => Partial<TestState>) => set(fn),
      get,
    }),
    options
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWouldLog.mockReturnValue(false);
});

// -----------------------------------------------------------------------
// Pure helper functions (exported indirectly via the middleware behaviour)
// -----------------------------------------------------------------------

describe('loggerMiddleware', () => {
  describe('disabled middleware', () => {
    it('passes through set/get without logging', () => {
      const store = buildStore({ count: 0 }, { enabled: false });
      store.set({ count: 1 });
      expect(store.get().count).toBe(1);
      expect(mockDebug).not.toHaveBeenCalled();
    });
  });

  describe('fast path — nothing would be logged', () => {
    it('applies state without computing diff', () => {
      // wouldLog returns false by default → fast path
      const store = buildStore({ count: 0 });
      store.set({ count: 1 });
      expect(store.get().count).toBe(1);
      expect(mockDebug).not.toHaveBeenCalled();
    });
  });

  describe('full logging path — stateChanges enabled', () => {
    beforeEach(() => {
      // Enable state change logging (DEBUG level)
      mockWouldLog.mockImplementation((level?: number) => (level ?? 0) >= LogLevel.DEBUG);
    });

    it('logs primitive value changes', () => {
      const store = buildStore({ count: 0 });
      store.set({ count: 5 });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          actionName: 'set:count',
          changes: expect.objectContaining({
            count: { prev: 0, next: 5 },
          }),
        })
      );
    });

    it('logs multiple field changes', () => {
      const store = buildStore({ a: 1, b: 2 });
      store.set({ a: 10, b: 20 });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          actionName: 'setMultiple:2Fields',
        })
      );
    });

    it('skips logging when no meaningful changes', () => {
      const store = buildStore({ count: 0 });
      store.set({ count: 0 }); // same value
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('detects added keys', () => {
      const store = buildStore({});
      store.set({ newKey: 'hello' });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          changes: expect.objectContaining({
            newKey: { added: true, value: 'hello' },
          }),
        })
      );
    });

    it('detects regular array length changes', () => {
      const store = buildStore({ items: [1, 2] });
      store.set({ items: [1, 2, 3] });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          changes: expect.objectContaining({
            items: { type: 'array', count: { prev: 2, next: 3 } },
          }),
        })
      );
    });

    it('skips arrays with same length', () => {
      const store = buildStore({ items: [1, 2] });
      const newArray = [3, 4]; // different content, same length
      store.set({ items: newArray });
      // array handler returns null when lengths are equal, so no diff for items
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('skips function values in diff', () => {
      const store = buildStore({ fn: () => {} });
      store.set({ fn: () => {} });
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('handles currentActivity changes', () => {
      const store = buildStore({
        currentActivity: { id: 1, name: 'Art', category: 'creative', roomId: 1, supervisorId: 1 },
      });
      store.set({
        currentActivity: { id: 1, name: 'Music', category: 'creative', roomId: 1, supervisorId: 1 },
      });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          changes: expect.objectContaining({
            currentActivity: expect.objectContaining({
              name: { prev: 'Art', next: 'Music' },
            }),
          }),
        })
      );
    });

    it('handles currentActivity set to null', () => {
      const store = buildStore({
        currentActivity: { id: 1, name: 'Art', category: 'c', roomId: 1, supervisorId: 1 },
      });
      store.set({ currentActivity: null });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          changes: expect.objectContaining({
            currentActivity: expect.objectContaining({
              name: { prev: 'Art', next: undefined },
            }),
          }),
        })
      );
    });

    it('handles currentActivity with no field changes', () => {
      const activity = { id: 1, name: 'Art', category: 'creative', roomId: 1, supervisorId: 1 };
      const store = buildStore({ currentActivity: { ...activity } });
      store.set({ currentActivity: { ...activity } });
      // Same field values → no diff
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('handles activities array with additions', () => {
      const store = buildStore({ activities: [{ id: 1, name: 'Art' }] });
      store.set({
        activities: [
          { id: 1, name: 'Art' },
          { id: 2, name: 'Music' },
        ],
      });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          changes: expect.objectContaining({
            activities: expect.objectContaining({
              count: { prev: 1, next: 2 },
              added: { id: 2, name: 'Music' },
            }),
          }),
        })
      );
    });

    it('handles activities array with removals', () => {
      const store = buildStore({
        activities: [
          { id: 1, name: 'Art' },
          { id: 2, name: 'Music' },
        ],
      });
      store.set({ activities: [{ id: 1, name: 'Art' }] });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          changes: expect.objectContaining({
            activities: expect.objectContaining({
              count: { prev: 2, next: 1 },
            }),
          }),
        })
      );
    });

    it('handles activities with non-array prev (special handler returns null)', () => {
      // Non-array prev → handleActivitiesArrayDiff returns null → no diff for this key
      const store = buildStore({ activities: 42 });
      store.set({ activities: [{ id: 1 }] });
      // Special handler returns null → processKeyDiff returns null → key excluded from diff
      // No other changes → no logging
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('handles activities array with same length', () => {
      const store = buildStore({ activities: [{ id: 1 }] });
      const newActivities = [{ id: 2 }]; // same length
      store.set({ activities: newActivities });
      // Same length → handleActivitiesArrayDiff returns null
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('handles activities with non-object last item', () => {
      const store = buildStore({ activities: [] });
      store.set({ activities: ['not-an-object'] });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          changes: expect.objectContaining({
            activities: expect.objectContaining({
              count: { prev: 0, next: 1 },
            }),
          }),
        })
      );
    });
  });

  describe('action name extraction', () => {
    beforeEach(() => {
      mockWouldLog.mockImplementation((level?: number) => (level ?? 0) >= LogLevel.DEBUG);
    });

    it('extracts name from plain object with single key', () => {
      const store = buildStore({ count: 0 });
      store.set({ count: 1 });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({ actionName: 'set:count' })
      );
    });

    it('extracts name from plain object with multiple keys', () => {
      const store = buildStore({ a: 1, b: 2 });
      store.set({ a: 10, b: 20 });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({ actionName: 'setMultiple:2Fields' })
      );
    });

    it('extracts name from functional update', () => {
      const store = createFakeStore(
        (set, get) => ({
          count: 0,
          wrappedSet: (p: Partial<TestState>) => set(p),
          wrappedSetFn: (fn: (s: TestState) => Partial<TestState>) => set(fn),
          get,
        }),
        { stateChanges: true }
      );

      // Use the functional set
      (store.get().wrappedSetFn as (fn: (s: TestState) => Partial<TestState>) => void)(
        function myNamedUpdate(prev: TestState) {
          return { count: (prev.count as number) + 1 };
        }
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({ actionName: 'myNamedUpdate' })
      );
    });

    it('handles anonymous functional update', () => {
      const store = createFakeStore(
        (set, get) => ({
          count: 0,
          wrappedSet: (p: Partial<TestState>) => set(p),
          wrappedSetFn: (fn: (s: TestState) => Partial<TestState>) => set(fn),
          get,
        }),
        { stateChanges: true }
      );

      (store.get().wrappedSetFn as (fn: (s: TestState) => Partial<TestState>) => void)(prev => ({
        count: (prev.count as number) + 1,
      }));
      // Arrow functions have an empty .name — middleware falls back to 'functionalUpdate' only for named functions
      // Anonymous arrow → name is '' → falls through to empty string
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({ actionName: '' })
      );
    });
  });

  describe('action filtering', () => {
    beforeEach(() => {
      mockWouldLog.mockImplementation((level?: number) => (level ?? 0) >= LogLevel.DEBUG);
    });

    it('excludes actions in excludedActions', () => {
      const store = buildStore(
        { count: 0 },
        {
          stateChanges: true,
          excludedActions: ['set:count'],
        }
      );
      store.set({ count: 1 });
      expect(mockDebug).not.toHaveBeenCalled();
      // But state still updated
      expect(store.get().count).toBe(1);
    });

    it('only includes actions in includedActions', () => {
      const store = buildStore(
        { count: 0, name: 'a' },
        {
          stateChanges: true,
          includedActions: ['set:name'],
        }
      );
      store.set({ count: 1 });
      expect(mockDebug).not.toHaveBeenCalled();
      store.set({ name: 'b' });
      expect(mockDebug).toHaveBeenCalled();
    });

    it('applies custom actionFilter', () => {
      const store = buildStore(
        { count: 0 },
        {
          stateChanges: true,
          actionFilter: (name: string) => name.startsWith('set:c'),
        }
      );
      store.set({ count: 1 });
      expect(mockDebug).toHaveBeenCalled();
    });

    it('rejects via custom actionFilter', () => {
      const store = buildStore(
        { count: 0 },
        {
          stateChanges: true,
          actionFilter: () => false,
        }
      );
      store.set({ count: 1 });
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('applies custom stateFilter', () => {
      const stateFilter = vi.fn(() => false);
      const store = buildStore(
        { count: 0 },
        {
          stateChanges: true,
          stateFilter,
        }
      );
      store.set({ count: 1 });
      expect(stateFilter).toHaveBeenCalled();
      expect(mockDebug).not.toHaveBeenCalled(); // filtered out
    });
  });

  describe('log level routing', () => {
    beforeEach(() => {
      mockWouldLog.mockReturnValue(true);
    });

    it('uses INFO level when configured', () => {
      const store = buildStore(
        { count: 0 },
        {
          stateChanges: true,
          logLevel: LogLevel.INFO,
        }
      );
      store.set({ count: 1 });
      expect(mockInfo).toHaveBeenCalledWith('State updated', expect.any(Object));
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('uses WARN level when configured', () => {
      const store = buildStore(
        { count: 0 },
        {
          stateChanges: true,
          logLevel: LogLevel.WARN,
        }
      );
      store.set({ count: 1 });
      expect(mockWarn).toHaveBeenCalledWith('State updated', expect.any(Object));
    });

    it('uses ERROR level when configured', () => {
      const store = buildStore(
        { count: 0 },
        {
          stateChanges: true,
          logLevel: LogLevel.ERROR,
        }
      );
      store.set({ count: 1 });
      expect(mockError).toHaveBeenCalledWith('State updated', expect.any(Object));
    });

    it('uses DEBUG level by default', () => {
      const store = buildStore({ count: 0 }, { stateChanges: true });
      store.set({ count: 1 });
      expect(mockDebug).toHaveBeenCalledWith('State updated', expect.any(Object));
    });
  });

  describe('activity tracking (full path)', () => {
    beforeEach(() => {
      // Enable both stateChanges and activity tracking
      mockWouldLog.mockReturnValue(true);
    });

    it('logs activity name changes at WARN level', () => {
      const store = buildStore(
        {
          currentActivity: { id: 1, name: 'Art', category: 'c', roomId: 1, supervisorId: 1 },
        },
        { stateChanges: true, activityTracking: true }
      );

      store.set({
        currentActivity: { id: 1, name: 'Music', category: 'c', roomId: 1, supervisorId: 1 },
      });

      expect(mockWarn).toHaveBeenCalledWith(
        'Activity name changed',
        expect.objectContaining({
          prev: 'Art',
          next: 'Music',
        })
      );
    });

    it('does not log activity warn when name stays the same', () => {
      const store = buildStore(
        {
          currentActivity: { id: 1, name: 'Art', category: 'c', roomId: 1, supervisorId: 1 },
        },
        { stateChanges: true, activityTracking: true }
      );

      store.set({
        currentActivity: { id: 1, name: 'Art', category: 'updated', roomId: 1, supervisorId: 1 },
      });

      // State updated is logged, but NOT Activity name changed
      expect(mockDebug).toHaveBeenCalledWith('State updated', expect.any(Object));
      expect(mockWarn).not.toHaveBeenCalledWith('Activity name changed', expect.any(Object));
    });
  });

  describe('activity-only fast path', () => {
    beforeEach(() => {
      // Only activity tracking enabled (WARN level), not state changes
      mockWouldLog.mockImplementation((level?: number) => (level ?? 0) >= LogLevel.WARN);
    });

    it('logs activity name change without full diff', () => {
      const store = buildStore(
        {
          currentActivity: { id: 1, name: 'Art' },
        },
        { stateChanges: true, activityTracking: true }
      );

      store.set({ currentActivity: { id: 1, name: 'Music' } });

      expect(mockWarn).toHaveBeenCalledWith(
        'Activity name changed',
        expect.objectContaining({
          prev: 'Art',
          next: 'Music',
        })
      );
      // No debug logging (fast path)
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('skips when activity reference unchanged', () => {
      const activity = { id: 1, name: 'Art' };
      const store = buildStore(
        { currentActivity: activity },
        { stateChanges: true, activityTracking: true }
      );

      // Set same reference by setting a different key
      store.set({ otherKey: 'value' });
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('skips when activity name stays the same', () => {
      const store = buildStore(
        { currentActivity: { id: 1, name: 'Art' } },
        { stateChanges: true, activityTracking: true }
      );

      store.set({ currentActivity: { id: 1, name: 'Art' } }); // new reference, same name
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('handles null → activity transition', () => {
      const store = buildStore(
        { currentActivity: null },
        { stateChanges: true, activityTracking: true }
      );

      store.set({ currentActivity: { id: 1, name: 'Art' } });
      expect(mockWarn).toHaveBeenCalledWith(
        'Activity name changed',
        expect.objectContaining({
          prev: undefined,
          next: 'Art',
        })
      );
    });

    it('handles activity → null transition', () => {
      const store = buildStore(
        { currentActivity: { id: 1, name: 'Art' } },
        { stateChanges: true, activityTracking: true }
      );

      store.set({ currentActivity: null });
      expect(mockWarn).toHaveBeenCalledWith(
        'Activity name changed',
        expect.objectContaining({
          prev: 'Art',
          next: undefined,
        })
      );
    });

    it('respects action filtering on fast path', () => {
      const store = buildStore(
        { currentActivity: { id: 1, name: 'Art' } },
        {
          stateChanges: true,
          activityTracking: true,
          excludedActions: ['set:currentActivity'],
        }
      );

      store.set({ currentActivity: { id: 1, name: 'Music' } });
      expect(mockWarn).not.toHaveBeenCalled();
      // But state still updated
      expect((store.get().currentActivity as { name: string }).name).toBe('Music');
    });

    it('respects includedActions on fast path', () => {
      const store = buildStore(
        { currentActivity: { id: 1, name: 'Art' } },
        {
          stateChanges: true,
          activityTracking: true,
          includedActions: ['set:other'],
        }
      );

      store.set({ currentActivity: { id: 1, name: 'Music' } });
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('respects actionFilter on fast path', () => {
      const store = buildStore(
        { currentActivity: { id: 1, name: 'Art' } },
        {
          stateChanges: true,
          activityTracking: true,
          actionFilter: () => false,
        }
      );

      store.set({ currentActivity: { id: 1, name: 'Music' } });
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('falls through to full path when stateFilter is set', () => {
      const stateFilter = vi.fn(() => true);
      const store = buildStore(
        { currentActivity: { id: 1, name: 'Art' } },
        {
          stateChanges: true,
          activityTracking: true,
          stateFilter,
        }
      );

      store.set({ currentActivity: { id: 1, name: 'Music' } });
      // stateFilter presence forces full path → stateFilter should be called
      expect(stateFilter).toHaveBeenCalled();
    });
  });

  describe('actionSource (caller info)', () => {
    beforeEach(() => {
      mockWouldLog.mockReturnValue(true);
    });

    it('includes source when actionSource enabled', () => {
      const store = buildStore({ count: 0 }, { stateChanges: true, actionSource: true });
      store.set({ count: 1 });
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          source: expect.any(String),
        })
      );
    });

    it('excludes source when actionSource disabled', () => {
      const store = buildStore({ count: 0 }, { stateChanges: true, actionSource: false });
      store.set({ count: 1 });
      const payload = mockDebug.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(payload.source).toBeUndefined();
    });
  });

  describe('default options', () => {
    it('uses sensible defaults when no options provided', () => {
      mockWouldLog.mockReturnValue(true);
      const store = buildStore({ count: 0 });
      store.set({ count: 1 });
      // Default: enabled, stateChanges, activityTracking, actionSource all true
      expect(mockDebug).toHaveBeenCalledWith(
        'State updated',
        expect.objectContaining({
          actionName: 'set:count',
          source: expect.any(String),
        })
      );
    });
  });
});
