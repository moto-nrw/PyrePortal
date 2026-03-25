import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Tauri IPC mocks — Tauri runtime is not available in test environment
// ---------------------------------------------------------------------------

// Mock @tauri-apps/api/core (invoke, convertFileSrc, etc.)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.reject(new Error('Tauri invoke not available in tests'))),
  convertFileSrc: vi.fn((path: string) => path),
}));

// Mock @tauri-apps/api/event (listen, emit, etc.)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
  once: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock @tauri-apps/plugin-opener (real exports: openUrl, openPath, revealItemInDir)
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(() => Promise.resolve()),
  openPath: vi.fn(() => Promise.resolve()),
  revealItemInDir: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// 2. tauriContext mock — safeInvoke should be mockable per-test
// ---------------------------------------------------------------------------

vi.mock('../utils/tauriContext', () => ({
  safeInvoke: vi.fn(() => Promise.reject(new Error('Tauri context not available in tests'))),
  isRfidEnabled: vi.fn(() => false),
}));

// ---------------------------------------------------------------------------
// 3. Logger mock — prevent Tauri IPC calls and console noise during tests
// ---------------------------------------------------------------------------

vi.mock('../utils/logger', () => {
  const noop = vi.fn();
  const createMockLogger = () => ({
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    wouldLog: vi.fn(() => false),
    updateConfig: noop,
    getInMemoryLogs: vi.fn(() => []),
    clearInMemoryLogs: noop,
    exportLogs: vi.fn(() => '[]'),
  });

  return {
    LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 },
    createLogger: vi.fn(() => createMockLogger()),
    logger: createMockLogger(),
    logUserAction: noop,
    logNavigation: noop,
    logError: noop,
    serializeError: vi.fn((error: unknown) => {
      if (error instanceof Error) {
        return { message: error.message, name: error.name };
      }
      return { message: String(error) };
    }),
    getRuntimeConfig: vi.fn(() => ({
      level: 4, // NONE
      persist: false,
      consoleOutput: false,
    })),
  };
});

// ---------------------------------------------------------------------------
// 4. Storage mocks — explicit, resettable between tests
// ---------------------------------------------------------------------------

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: createStorageMock(),
});

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  writable: true,
  value: createStorageMock(),
});

// ---------------------------------------------------------------------------
// 5. Browser API mocks
// ---------------------------------------------------------------------------

// matchMedia (used by some UI components / Tailwind runtime checks)
Object.defineProperty(globalThis, 'matchMedia', {
  configurable: true,
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })),
});

// crypto.randomUUID (used by logger session ID)
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value: {
      ...globalThis.crypto,
      randomUUID: () => '00000000-0000-0000-0000-000000000000',
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
        return array;
      },
    },
  });
}

// ---------------------------------------------------------------------------
// 6. Cleanup between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});
