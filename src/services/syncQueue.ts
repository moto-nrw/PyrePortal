/**
 * Sync Queue Service
 * Handles queuing and retry logic for failed operations during poor network conditions
 */

import { createLogger } from '../utils/logger';

import { api } from './api';

const logger = createLogger('SyncQueue');

// Types for queued operations
export interface QueuedScan {
  id: string;
  rfidTag: string;
  action: 'checkin' | 'checkout';
  roomId: number;
  pin: string;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface SyncQueueStatus {
  queuedOperations: number;
  lastSyncAttempt: number | null;
  isSyncing: boolean;
}

// In-memory queue (could be persisted later if needed)
let operationQueue: QueuedScan[] = [];
let isSyncing = false;
let lastSyncAttempt: number | null = null;

// Configuration
const MAX_RETRIES = 3;
const MAX_QUEUE_SIZE = 100;

/**
 * Add a failed scan operation to the sync queue
 */
export function queueFailedScan(
  rfidTag: string,
  action: 'checkin' | 'checkout',
  roomId: number,
  pin: string
): string {
  const operationId = `sync_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  const queuedScan: QueuedScan = {
    id: operationId,
    rfidTag,
    action,
    roomId,
    pin,
    timestamp: Date.now(),
    retryCount: 0,
    maxRetries: MAX_RETRIES,
  };

  // Prevent queue from growing too large
  if (operationQueue.length >= MAX_QUEUE_SIZE) {
    logger.warn('Sync queue at maximum size, removing oldest operation');
    operationQueue.shift(); // Remove oldest
  }

  operationQueue.push(queuedScan);

  logger.info('Scan operation queued for sync', {
    operationId,
    rfidTag,
    action,
    queueSize: operationQueue.length,
  });

  return operationId;
}

/**
 * Process the sync queue and retry failed operations
 */
export async function processSyncQueue(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  remaining: number;
}> {
  if (isSyncing || operationQueue.length === 0) {
    logger.debug('Sync queue processing skipped', {
      isSyncing,
      queueSize: operationQueue.length,
    });
    return {
      processed: 0,
      successful: 0,
      failed: 0,
      remaining: operationQueue.length,
    };
  }

  isSyncing = true;
  lastSyncAttempt = Date.now();

  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    remaining: 0,
  };

  logger.info('Starting sync queue processing', {
    queueSize: operationQueue.length,
  });

  // Process operations in chronological order
  const operationsToProcess = [...operationQueue];
  const successfulOperations: string[] = [];

  for (const operation of operationsToProcess) {
    results.processed++;

    try {
      logger.debug('Processing queued operation', {
        operationId: operation.id,
        rfidTag: operation.rfidTag,
        action: operation.action,
        retryCount: operation.retryCount,
      });

      // Attempt to sync the operation
      const result = await api.processRfidScan(
        {
          student_rfid: operation.rfidTag,
          action: operation.action,
          room_id: operation.roomId,
        },
        operation.pin
      );

      logger.info('Queued operation synced successfully', {
        operationId: operation.id,
        studentName: result.student_name,
        action: result.action,
      });

      results.successful++;
      successfulOperations.push(operation.id);
    } catch (error) {
      logger.warn('Queued operation sync failed', {
        operationId: operation.id,
        error: error instanceof Error ? error.message : String(error),
        retryCount: operation.retryCount,
        maxRetries: operation.maxRetries,
      });

      // Increment retry count
      operation.retryCount++;

      if (operation.retryCount >= operation.maxRetries) {
        logger.error('Queued operation exceeded max retries, removing from queue', {
          operationId: operation.id,
          finalRetryCount: operation.retryCount,
        });

        results.failed++;
        successfulOperations.push(operation.id); // Remove from queue
      }
    }

    // Add small delay between operations to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Remove successful and permanently failed operations from queue
  operationQueue = operationQueue.filter(op => !successfulOperations.includes(op.id));
  results.remaining = operationQueue.length;

  logger.info('Sync queue processing completed', {
    ...results,
    duration: Date.now() - lastSyncAttempt,
  });

  isSyncing = false;
  return results;
}

/**
 * Get current sync queue status
 */
export function getSyncQueueStatus(): SyncQueueStatus {
  return {
    queuedOperations: operationQueue.length,
    lastSyncAttempt,
    isSyncing,
  };
}

/**
 * Clear all operations from the sync queue
 */
export function clearSyncQueue(): void {
  const clearedCount = operationQueue.length;
  operationQueue = [];

  logger.info('Sync queue cleared', {
    clearedOperations: clearedCount,
  });
}

/**
 * Start automatic sync queue processing on a timer
 */
export function startAutoSync(intervalMs = 30000): () => void {
  logger.info('Starting automatic sync queue processing', {
    intervalMs,
  });

  const interval = setInterval(() => {
    processSyncQueue().catch((error: unknown) => {
      logger.error('Auto sync queue processing failed', { error });
    });
  }, intervalMs);

  // Return cleanup function
  return () => {
    clearInterval(interval);
    logger.info('Automatic sync queue processing stopped');
  };
}

/**
 * Remove a specific operation from the queue
 */
export function removeFromQueue(operationId: string): boolean {
  const initialSize = operationQueue.length;
  operationQueue = operationQueue.filter(op => op.id !== operationId);

  const removed = operationQueue.length < initialSize;

  if (removed) {
    logger.debug('Operation removed from sync queue', {
      operationId,
      remainingOperations: operationQueue.length,
    });
  }

  return removed;
}
