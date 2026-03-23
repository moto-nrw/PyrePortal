/**
 * Tests for the logger module.
 *
 * The global test setup mocks ../utils/logger, so we must unmock it here
 * and mock only the platform adapter (which logger imports for persistLog).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Unmock the logger so we test the real implementation
vi.unmock('../utils/logger');

// Mock the platform adapter used by logger for persistLog
vi.mock('@platform', () => ({
  adapter: {
    persistLog: vi.fn(() => Promise.resolve()),
  },
}));

const { adapter } = await import('@platform');
const mockPersistLog = vi.mocked(adapter.persistLog);

// Import the real logger after unmocking
const {
  createLogger,
  LogLevel,
  serializeError,
  logUserAction,
  logNavigation,
  logError,
  getRuntimeConfig,
} = await import('./logger');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('serializeError', () => {
  it('serializes Error instances with message, name, and stack', () => {
    const err = new Error('test error');
    const result = serializeError(err);
    expect(result.message).toBe('test error');
    expect(result.name).toBe('Error');
    expect(result.stack).toBeDefined();
  });

  it('serializes non-Error values as string message', () => {
    expect(serializeError('oops')).toEqual({ message: 'oops' });
    expect(serializeError(42)).toEqual({ message: '42' });
    expect(serializeError(null)).toEqual({ message: 'null' });
  });

  it('omits stack when Error has no stack', () => {
    const err = new Error('no stack');
    err.stack = undefined;
    const result = serializeError(err);
    expect(result).not.toHaveProperty('stack');
  });
});

describe('getRuntimeConfig', () => {
  it('returns a config object with expected keys', () => {
    const config = getRuntimeConfig();
    expect(config).toHaveProperty('level');
    expect(config).toHaveProperty('persist');
    expect(config).toHaveProperty('consoleOutput');
  });

  it('enables debug when localStorage flag is set', () => {
    localStorage.setItem('pyrePortalDebugLogging', 'true');
    const config = getRuntimeConfig();
    expect(config.level).toBe(LogLevel.DEBUG);
    expect(config.persistLevel).toBe(LogLevel.DEBUG);
    localStorage.removeItem('pyrePortalDebugLogging');
  });
});

describe('Logger', () => {
  it('creates a logger with createLogger', () => {
    const log = createLogger('TestSource');
    expect(log).toBeDefined();
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  describe('wouldLog', () => {
    it('returns true for levels at or above config level', () => {
      const log = createLogger('Test', { level: LogLevel.WARN, persistLevel: LogLevel.WARN });
      expect(log.wouldLog(LogLevel.ERROR)).toBe(true);
      expect(log.wouldLog(LogLevel.WARN)).toBe(true);
      expect(log.wouldLog(LogLevel.INFO)).toBe(false);
    });

    it('considers persistLevel too', () => {
      const log = createLogger('Test', { level: LogLevel.ERROR, persistLevel: LogLevel.INFO });
      expect(log.wouldLog(LogLevel.INFO)).toBe(true);
    });
  });

  describe('log levels', () => {
    it('stores logs in memory', () => {
      const log = createLogger('MemTest', {
        level: LogLevel.DEBUG,
        consoleOutput: false,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.debug('debug msg');
      log.info('info msg', { key: 'val' });
      log.warn('warn msg');
      log.error('error msg');

      const logs = log.getInMemoryLogs();
      expect(logs.length).toBe(4);
      expect(logs[0].level).toBe('DEBUG');
      expect(logs[0].source).toBe('MemTest');
      expect(logs[0].message).toBe('debug msg');
      expect(logs[1].data).toEqual({ key: 'val' });
      expect(logs[2].level).toBe('WARN');
      expect(logs[3].level).toBe('ERROR');
    });

    it('skips logs below both console and persist level', () => {
      const log = createLogger('SkipTest', {
        level: LogLevel.ERROR,
        persistLevel: LogLevel.ERROR,
        consoleOutput: false,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.debug('should skip');
      log.info('should skip');
      log.warn('should skip');
      log.error('should appear');

      const logs = log.getInMemoryLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('ERROR');
    });
  });

  describe('getInMemoryLogs with level filter', () => {
    it('filters by minimum level', () => {
      const log = createLogger('FilterTest', {
        level: LogLevel.DEBUG,
        consoleOutput: false,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      const warnAndAbove = log.getInMemoryLogs(LogLevel.WARN);
      expect(warnAndAbove.length).toBe(2);
      expect(warnAndAbove[0].level).toBe('WARN');
      expect(warnAndAbove[1].level).toBe('ERROR');
    });
  });

  describe('clearInMemoryLogs', () => {
    it('clears all stored logs', () => {
      const log = createLogger('ClearTest', {
        level: LogLevel.DEBUG,
        consoleOutput: false,
        persist: false,
      });
      log.info('msg');
      log.clearInMemoryLogs();
      expect(log.getInMemoryLogs()).toEqual([]);
    });
  });

  describe('exportLogs', () => {
    it('returns JSON string of logs', () => {
      const log = createLogger('ExportTest', {
        level: LogLevel.DEBUG,
        consoleOutput: false,
        persist: false,
      });
      log.clearInMemoryLogs();
      log.info('export me');

      const json = log.exportLogs();
      const parsed = JSON.parse(json) as unknown[];
      expect(parsed.length).toBe(1);
    });
  });

  describe('updateConfig', () => {
    it('updates logger configuration', () => {
      const log = createLogger('ConfigTest', {
        level: LogLevel.ERROR,
        persistLevel: LogLevel.ERROR,
        consoleOutput: false,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.debug('should skip');
      expect(log.getInMemoryLogs()).toEqual([]);

      log.updateConfig({ level: LogLevel.DEBUG });
      log.debug('should appear');
      expect(log.getInMemoryLogs().length).toBe(1);
    });
  });

  describe('console output', () => {
    it('writes to console.debug for DEBUG level', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const log = createLogger('ConsoleTest', {
        level: LogLevel.DEBUG,
        consoleOutput: true,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.debug('test debug');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('writes to console.info for INFO level', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const log = createLogger('ConsoleTest', {
        level: LogLevel.DEBUG,
        consoleOutput: true,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.info('test info');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('writes to console.warn for WARN level', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const log = createLogger('ConsoleTest', {
        level: LogLevel.DEBUG,
        consoleOutput: true,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.warn('test warn');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('writes to console.error for ERROR level', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const log = createLogger('ConsoleTest', {
        level: LogLevel.DEBUG,
        consoleOutput: true,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.error('test error');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('does not write to console when consoleOutput is false', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const log = createLogger('SilentTest', {
        level: LogLevel.DEBUG,
        consoleOutput: false,
        persist: false,
      });
      log.clearInMemoryLogs();

      log.info('silent');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('persistence', () => {
    it('calls adapter.persistLog when persist is enabled', async () => {
      const log = createLogger('PersistTest', {
        level: LogLevel.DEBUG,
        persistLevel: LogLevel.DEBUG,
        persist: true,
        consoleOutput: false,
      });
      log.clearInMemoryLogs();

      log.info('persist this');

      // persistLog is async and fire-and-forget — wait for microtask
      await vi.waitFor(() => {
        expect(mockPersistLog).toHaveBeenCalled();
      });

      const call = mockPersistLog.mock.calls[0][0];
      const parsed = JSON.parse(call) as { message: string };
      expect(parsed.message).toBe('persist this');
    });

    it('handles persist failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPersistLog.mockRejectedValueOnce(new Error('disk full'));

      const log = createLogger('FailPersist', {
        level: LogLevel.DEBUG,
        persistLevel: LogLevel.DEBUG,
        persist: true,
        consoleOutput: false,
      });
      log.clearInMemoryLogs();

      log.info('will fail persist');

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to persist log:', 'disk full');
      });

      consoleSpy.mockRestore();
    });

    it('suppresses "not implemented yet" persist errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPersistLog.mockRejectedValueOnce(new Error('not implemented yet'));

      const log = createLogger('SuppressTest', {
        level: LogLevel.DEBUG,
        persistLevel: LogLevel.DEBUG,
        persist: true,
        consoleOutput: false,
      });
      log.clearInMemoryLogs();

      log.info('suppress this error');

      // Wait a tick for the async handler
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(consoleSpy).not.toHaveBeenCalledWith(
        'Failed to persist log:',
        expect.stringContaining('not implemented')
      );

      consoleSpy.mockRestore();
    });

    it('does not persist when below persistLevel', () => {
      const log = createLogger('NoPersist', {
        level: LogLevel.DEBUG,
        persistLevel: LogLevel.ERROR,
        persist: true,
        consoleOutput: false,
      });
      log.clearInMemoryLogs();

      log.debug('below persist level');
      expect(mockPersistLog).not.toHaveBeenCalled();
    });
  });

  describe('circular buffer', () => {
    it('trims oldest entries when maxInMemoryLogs is exceeded', () => {
      const log = createLogger('BufferTest', {
        level: LogLevel.DEBUG,
        consoleOutput: false,
        persist: false,
        maxInMemoryLogs: 3,
      });
      log.clearInMemoryLogs();

      log.info('msg1');
      log.info('msg2');
      log.info('msg3');
      log.info('msg4');

      const logs = log.getInMemoryLogs();
      expect(logs.length).toBe(3);
      expect(logs[0].message).toBe('msg2');
      expect(logs[2].message).toBe('msg4');
    });
  });
});

describe('convenience functions', () => {
  it('logUserAction logs with action detail', () => {
    // This just calls logger.info internally — we verify it doesn't throw
    expect(() => logUserAction('click_button', { buttonId: 'submit' })).not.toThrow();
  });

  it('logNavigation logs from/to', () => {
    expect(() => logNavigation('/home', '/settings')).not.toThrow();
  });

  it('logError logs error details', () => {
    const err = new Error('test');
    expect(() => logError(err, 'test context')).not.toThrow();
  });
});
