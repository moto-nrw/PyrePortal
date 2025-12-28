/**
 * Custom hook for fetching and managing assignable entities (students and teachers)
 * Extracted from StudentSelectionPage to reduce cognitive complexity
 */
import { useState, useEffect, useMemo } from 'react';

import { api, type Student, type Teacher } from '../services/api';
import { createLogger } from '../utils/logger';

// Union type for assignable entities
export type AssignableEntity =
  | { type: 'student'; data: Student }
  | { type: 'teacher'; data: Teacher };

interface UseEntityFetchingParams {
  pin: string | undefined;
  staffId: number | undefined;
  supervisorIds: number[];
  isAuthenticated: boolean;
}

interface UseEntityFetchingResult {
  entities: AssignableEntity[];
  isLoading: boolean;
  error: string | null;
  availableClasses: string[];
}

const logger = createLogger('useEntityFetching');

/**
 * Hook that fetches students and teachers, combining them into a unified entity list
 */
export function useEntityFetching({
  pin,
  staffId,
  supervisorIds,
  isAuthenticated,
}: UseEntityFetchingParams): UseEntityFetchingResult {
  const [entities, setEntities] = useState<AssignableEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEntities = async () => {
      if (!pin) return;

      try {
        setIsLoading(true);
        setError(null);

        logger.debug('Fetching students and teachers', {
          supervisorCount: supervisorIds.length,
          authenticatedUserId: staffId,
        });

        // If no supervisors selected, use authenticated user's ID
        const teacherIds = supervisorIds.length > 0 ? supervisorIds : [staffId!];

        // Fetch both students and teachers in parallel
        const [studentList, teacherList] = await Promise.all([
          api.getStudents(pin, teacherIds),
          api.getTeachers(),
        ]);

        // Combine into unified entity list
        const combinedEntities: AssignableEntity[] = [
          ...studentList.map(s => ({ type: 'student' as const, data: s })),
          ...teacherList.map(t => ({ type: 'teacher' as const, data: t })),
        ];

        setEntities(combinedEntities);
        logger.info('Entities fetched successfully', {
          students: studentList.length,
          teachers: teacherList.length,
          total: combinedEntities.length,
        });
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        logger.error('Failed to fetch entities', {
          error: errorObj.message,
          stack: errorObj.stack,
        });
        setError(`Fehler beim Laden: ${errorObj.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    if (isAuthenticated) {
      void fetchEntities();
    }
  }, [pin, staffId, supervisorIds, isAuthenticated]);

  // Extract available classes from student entities
  const availableClasses = useMemo(() => {
    const classSet = new Set<string>();
    for (const entity of entities) {
      if (entity.type === 'student' && entity.data.school_class) {
        classSet.add(entity.data.school_class);
      }
    }
    return Array.from(classSet).sort((a, b) => a.localeCompare(b, 'de'));
  }, [entities]);

  return { entities, isLoading, error, availableClasses };
}
