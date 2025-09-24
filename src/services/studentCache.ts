/**
 * Student Cache Service
 * Provides persistent caching of RFID tag to student mappings for offline operation
 */

import { createLogger } from '../utils/logger';
import { safeInvoke } from '../utils/tauriContext';

import type { RfidScanResult } from './api';

const logger = createLogger('StudentCache');

// Cache entry structure
export interface CachedStudent {
  id: number;
  name: string;
  status: 'checked_in' | 'checked_out';
  lastSeen: string; // ISO timestamp
  room?: string;
  activity?: string;
  cachedAt: string; // ISO timestamp when cached
}

// Cache structure
export interface StudentCacheData {
  students: Record<string, CachedStudent>; // rfidTag -> CachedStudent
  metadata: {
    lastSync: string;
    version: number;
    dateCreated: string; // Date key for daily reset
  };
}

// Cache configuration
const CACHE_VERSION = 1;
const MAX_CACHE_AGE_HOURS = 24; // Cache expires after 24 hours

/**
 * Get today's date string for cache file naming
 */
function getTodayDateKey(): string {
  return new Date().toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

// Removed getCacheFileName - not needed for frontend implementation

/**
 * Create empty cache structure
 */
function createEmptyCache(): StudentCacheData {
  return {
    students: {},
    metadata: {
      lastSync: new Date().toISOString(),
      version: CACHE_VERSION,
      dateCreated: getTodayDateKey(),
    },
  };
}

/**
 * Validate cache data structure and version
 */
function validateCacheData(data: unknown): data is StudentCacheData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (!obj.students || typeof obj.students !== 'object') return false;
  if (!obj.metadata || typeof obj.metadata !== 'object') return false;
  const metadata = obj.metadata as Record<string, unknown>;
  if (typeof metadata.version !== 'number' || metadata.version !== CACHE_VERSION) return false;
  if (typeof metadata.dateCreated !== 'string' || metadata.dateCreated !== getTodayDateKey()) return false;
  return true;
}

/**
 * Check if cached entry is still fresh
 */
function isCacheEntryFresh(cachedAt: string): boolean {
  const cached = new Date(cachedAt);
  const now = new Date();
  const ageHours = (now.getTime() - cached.getTime()) / (1000 * 60 * 60);
  return ageHours <= MAX_CACHE_AGE_HOURS;
}

/**
 * Load student cache from persistent storage
 */
export async function loadStudentCache(): Promise<StudentCacheData> {
  try {
    logger.debug('Loading student cache from storage');

    const cacheData = await safeInvoke<StudentCacheData | null>('load_student_cache');

    if (!cacheData) {
      logger.info('No existing cache found, creating new cache');
      return createEmptyCache();
    }

    // Validate cache data
    if (!validateCacheData(cacheData)) {
      const obj = cacheData as Record<string, unknown>;
      const metadata = obj?.metadata as Record<string, unknown>;
      logger.warn('Invalid cache data found, creating new cache', {
        version: metadata?.version,
        dateCreated: metadata?.dateCreated,
        expectedDate: getTodayDateKey(),
      });
      return createEmptyCache();
    }

    // Clean up expired entries
    const cleanedStudents: Record<string, CachedStudent> = {};
    let expiredCount = 0;

    Object.entries(cacheData.students).forEach(([rfidTag, student]) => {
      if (isCacheEntryFresh(student.cachedAt)) {
        cleanedStudents[rfidTag] = student;
      } else {
        expiredCount++;
      }
    });

    const cleanedCache: StudentCacheData = {
      students: cleanedStudents,
      metadata: cacheData.metadata,
    };

    logger.info('Student cache loaded successfully', {
      totalEntries: Object.keys(cacheData.students).length,
      validEntries: Object.keys(cleanedStudents).length,
      expiredEntries: expiredCount,
      dateCreated: cacheData.metadata.dateCreated,
    });

    return cleanedCache;
  } catch (error) {
    logger.error('Failed to load student cache, creating new cache', { error });
    return createEmptyCache();
  }
}

/**
 * Save student cache to persistent storage
 */
export async function saveStudentCache(cacheData: StudentCacheData): Promise<void> {
  try {
    // Update metadata
    const updatedCache: StudentCacheData = {
      ...cacheData,
      metadata: {
        ...cacheData.metadata,
        lastSync: new Date().toISOString(),
      },
    };

    logger.debug('Saving student cache to storage', {
      entryCount: Object.keys(updatedCache.students).length,
    });

    await safeInvoke('save_student_cache', { settings: updatedCache });

    logger.info('Student cache saved successfully', {
      entryCount: Object.keys(updatedCache.students).length,
    });
  } catch (error) {
    logger.error('Failed to save student cache', { error });
    throw error;
  }
}

/**
 * Get cached student data for a specific RFID tag
 */
export function getCachedStudent(
  cache: StudentCacheData,
  rfidTag: string
): CachedStudent | null {
  const student = cache.students[rfidTag];

  if (!student) {
    logger.debug('No cached student found for tag', { rfidTag });
    return null;
  }

  if (!isCacheEntryFresh(student.cachedAt)) {
    logger.debug('Cached student data is expired', {
      rfidTag,
      cachedAt: student.cachedAt,
    });
    return null;
  }

  logger.debug('Retrieved cached student data', {
    rfidTag,
    studentId: student.id,
    studentName: student.name,
    status: student.status,
  });

  return student;
}

/**
 * Add or update student in cache
 */
export function setCachedStudent(
  cache: StudentCacheData,
  rfidTag: string,
  studentData: Omit<CachedStudent, 'cachedAt'>
): StudentCacheData {
  const now = new Date().toISOString();

  const updatedCache: StudentCacheData = {
    students: {
      ...cache.students,
      [rfidTag]: {
        ...studentData,
        cachedAt: now,
      },
    },
    metadata: cache.metadata,
  };

  logger.debug('Updated cached student data', {
    rfidTag,
    studentId: studentData.id,
    studentName: studentData.name,
    status: studentData.status,
  });

  return updatedCache;
}

/**
 * Convert API scan result to cached student format
 */
export function scanResultToCachedStudent(
  scanResult: RfidScanResult,
  additionalData?: {
    room?: string;
    activity?: string;
  }
): Omit<CachedStudent, 'cachedAt'> {
  return {
    id: scanResult.student_id,
    name: scanResult.student_name,
    status: scanResult.action === 'checked_out' ? 'checked_out' : 'checked_in',
    lastSeen: scanResult.processed_at ?? new Date().toISOString(),
    room: additionalData?.room ?? scanResult.room_name,
    activity: additionalData?.activity,
  };
}

/**
 * Remove expired entries from cache
 */
export function cleanExpiredEntries(cache: StudentCacheData): StudentCacheData {
  const cleanedStudents: Record<string, CachedStudent> = {};
  let expiredCount = 0;

  Object.entries(cache.students).forEach(([rfidTag, student]) => {
    if (isCacheEntryFresh(student.cachedAt)) {
      cleanedStudents[rfidTag] = student;
    } else {
      expiredCount++;
    }
  });

  if (expiredCount > 0) {
    logger.info('Cleaned expired cache entries', { expiredCount });
  }

  return {
    students: cleanedStudents,
    metadata: cache.metadata,
  };
}

/**
 * Get cache statistics
 */
export function getCacheStats(cache: StudentCacheData): {
  totalEntries: number;
  freshEntries: number;
  expiredEntries: number;
  checkedInCount: number;
  checkedOutCount: number;
  dateCreated: string;
  lastSync: string;
} {
  const entries = Object.values(cache.students);
  const freshEntries = entries.filter(s => isCacheEntryFresh(s.cachedAt));
  const expiredEntries = entries.length - freshEntries.length;

  return {
    totalEntries: entries.length,
    freshEntries: freshEntries.length,
    expiredEntries,
    checkedInCount: freshEntries.filter(s => s.status === 'checked_in').length,
    checkedOutCount: freshEntries.filter(s => s.status === 'checked_out').length,
    dateCreated: cache.metadata.dateCreated,
    lastSync: cache.metadata.lastSync,
  };
}