import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback } from 'react';

import { LogLevel, type LogEntry, logger } from './logger';

/**
 * Log viewer properties
 */
interface LogViewerProps {
  maxEntries?: number;
  minLevel?: LogLevel;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onClose?: () => void;
}

/**
 * Log Viewer component for displaying and managing application logs
 */
function LogViewer({
  maxEntries = 100,
  minLevel = LogLevel.INFO,
  autoRefresh = true,
  refreshInterval = 5000,
  onClose,
}: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [persistedLogs, setPersistedLogs] = useState<string[]>([]);
  const [selectedLogFile, setSelectedLogFile] = useState<string>('');
  const [viewType, setViewType] = useState<'memory' | 'persisted'>('memory');
  const [filterLevel, setFilterLevel] = useState<LogLevel>(minLevel);

  // Fetch in-memory logs
  const fetchMemoryLogs = useCallback(() => {
    const memoryLogs = logger.getInMemoryLogs(filterLevel);
    // Only take the most recent logs based on maxEntries
    setLogs(memoryLogs.slice(-maxEntries));
  }, [filterLevel, maxEntries]);

  // Fetch available log files from the filesystem
  const fetchLogFiles = useCallback(async () => {
    try {
      const files = await invoke<string[]>('get_log_files', {})
        .catch((error) => {
          logger.error('Failed to fetch log files', { error });
          return [] as string[];
        });
      if (files.length > 0 && !selectedLogFile) {
        setSelectedLogFile(files[0]);
      }
    } catch (error) {
      logger.error('Failed to fetch log files', { error });
    }
  }, [selectedLogFile]);

  // Read a specific log file
  const readLogFile = useCallback(async (fileName: string) => {
    try {
      const content = await invoke<string>('read_log_file', { fileName })
        .catch((error) => {
          logger.error(`Failed to read log file ${fileName}`, { error });
          return '';
        });
      // Parse log content as individual lines, filtering out empty lines
      const lines = content.split('\n').filter(line => line.trim());
      setPersistedLogs(lines);
    } catch (error) {
      logger.error(`Failed to read log file ${fileName}`, { error });
    }
  }, []);

  // Export logs
  const exportLogs = () => {
    const exportData = logger.exportLogs(filterLevel);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `pyreportal-logs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Clear in-memory logs
  const clearMemoryLogs = () => {
    logger.clearInMemoryLogs();
    setLogs([]);
  };

  // Initial load and refresh effect
  useEffect(() => {
    fetchMemoryLogs();
    void fetchLogFiles();

    // Set up auto-refresh if enabled
    let interval: number | undefined;
    if (autoRefresh) {
      interval = window.setInterval(() => {
        if (viewType === 'memory') {
          fetchMemoryLogs();
        } else if (selectedLogFile) {
          void readLogFile(selectedLogFile);
        }
      }, refreshInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval, viewType, selectedLogFile, fetchMemoryLogs, fetchLogFiles, readLogFile]);

  // Fetch persisted logs when selectedLogFile changes
  useEffect(() => {
    if (selectedLogFile && viewType === 'persisted') {
      void readLogFile(selectedLogFile);
    }
  }, [selectedLogFile, viewType, readLogFile]);

  return (
    <div className="mx-auto max-w-4xl rounded-lg bg-white p-4 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Log Viewer</h2>
        {onClose && (
          <button onClick={onClose} className="rounded-full bg-gray-200 p-2 hover:bg-gray-300">
            ✕
          </button>
        )}
      </div>

      <div className="mb-4 flex space-x-4">
        <div className="flex-1">
          <div className="mb-2 flex space-x-2">
            <button
              onClick={() => setViewType('memory')}
              className={`rounded px-3 py-1 ${
                viewType === 'memory' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              Memory Logs
            </button>
            <button
              onClick={() => setViewType('persisted')}
              className={`rounded px-3 py-1 ${
                viewType === 'persisted'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              File Logs
            </button>
          </div>

          {viewType === 'memory' && (
            <div className="mb-2 flex space-x-2">
              <select
                value={filterLevel}
                onChange={e => setFilterLevel(Number(e.target.value))}
                className="rounded border px-2 py-1"
              >
                <option value={LogLevel.DEBUG}>Debug</option>
                <option value={LogLevel.INFO}>Info</option>
                <option value={LogLevel.WARN}>Warning</option>
                <option value={LogLevel.ERROR}>Error</option>
              </select>
              <button
                onClick={fetchMemoryLogs}
                className="rounded bg-gray-200 px-3 py-1 hover:bg-gray-300"
              >
                Refresh
              </button>
              <button
                onClick={clearMemoryLogs}
                className="rounded bg-red-100 px-3 py-1 hover:bg-red-200"
              >
                Clear
              </button>
              <button
                onClick={exportLogs}
                className="rounded bg-green-100 px-3 py-1 hover:bg-green-200"
              >
                Export
              </button>
            </div>
          )}

          {viewType === 'persisted' && (
            <div className="mb-2 flex space-x-2">
              <select
                value={selectedLogFile}
                onChange={e => setSelectedLogFile(e.target.value)}
                className="flex-1 rounded border px-2 py-1"
              >
                {persistedLogs.length === 0 && <option value="">No log files found</option>}
                {persistedLogs.map(file => (
                  <option key={file} value={file}>
                    {file}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void fetchLogFiles()}
                className="rounded bg-gray-200 px-3 py-1 hover:bg-gray-300"
              >
                Refresh
              </button>
              {selectedLogFile && (
                <button
                  onClick={() => void readLogFile(selectedLogFile)}
                  className="rounded bg-gray-200 px-3 py-1 hover:bg-gray-300"
                >
                  Load
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="h-96 overflow-auto rounded border bg-gray-50 p-2 font-mono text-xs">
        {viewType === 'memory' &&
          (logs.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No logs to display</div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`border-b py-1 ${
                  log.level === 'ERROR'
                    ? 'bg-red-50 text-red-700'
                    : log.level === 'WARN'
                      ? 'bg-yellow-50 text-yellow-700'
                      : log.level === 'INFO'
                        ? 'text-blue-700'
                        : 'text-gray-700'
                }`}
              >
                <span className="text-gray-500">{log.timestamp}</span>{' '}
                <span
                  className={`font-bold ${
                    log.level === 'ERROR'
                      ? 'text-red-700'
                      : log.level === 'WARN'
                        ? 'text-yellow-700'
                        : log.level === 'INFO'
                          ? 'text-blue-700'
                          : 'text-gray-700'
                  }`}
                >
                  [{log.level}]
                </span>{' '}
                <span className="text-gray-800">[{log.source}]</span> <span>{log.message}</span>
                {log.data && (
                  <pre className="ml-6 text-xs whitespace-pre-wrap text-gray-600">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))
          ))}

        {viewType === 'persisted' &&
          (persistedLogs.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {selectedLogFile ? 'No logs in file' : 'Select a log file'}
            </div>
          ) : (
            persistedLogs.map((line, index) => {
              let logEntry: LogEntry | null = null;
              try {
                logEntry = JSON.parse(line) as LogEntry;
              } catch {
                // If can't parse as JSON, show as raw text
                return (
                  <div key={index} className="border-b py-1 text-gray-700">
                    {line}
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className={`border-b py-1 ${
                    logEntry?.level === 'ERROR'
                      ? 'bg-red-50 text-red-700'
                      : logEntry?.level === 'WARN'
                        ? 'bg-yellow-50 text-yellow-700'
                        : logEntry?.level === 'INFO'
                          ? 'text-blue-700'
                          : 'text-gray-700'
                  }`}
                >
                  <span className="text-gray-500">{logEntry?.timestamp}</span>{' '}
                  <span
                    className={`font-bold ${
                      logEntry?.level === 'ERROR'
                        ? 'text-red-700'
                        : logEntry?.level === 'WARN'
                          ? 'text-yellow-700'
                          : logEntry?.level === 'INFO'
                            ? 'text-blue-700'
                            : 'text-gray-700'
                    }`}
                  >
                    [{logEntry?.level}]
                  </span>{' '}
                  <span className="text-gray-800">[{logEntry?.source}]</span>{' '}
                  <span>{logEntry?.message}</span>
                  {logEntry?.data && (
                    <pre className="ml-6 text-xs whitespace-pre-wrap text-gray-600">
                      {JSON.stringify(logEntry?.data, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })
          ))}
      </div>

      <div className="mt-2 text-xs text-gray-500">
        {viewType === 'memory' &&
          logs.length > 0 &&
          `Displaying ${logs.length} ${
            logs.length === 1 ? 'entry' : 'entries'
          } (minimum level: ${LogLevel[filterLevel]})`}
        {viewType === 'persisted' &&
          persistedLogs.length > 0 &&
          `Displaying ${persistedLogs.length} ${
            persistedLogs.length === 1 ? 'entry' : 'entries'
          } from ${selectedLogFile}`}
      </div>
    </div>
  );
}

export default LogViewer;