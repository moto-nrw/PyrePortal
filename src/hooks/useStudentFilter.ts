import { useMemo, useState } from 'react';

import type { Student, Teacher } from '../services/api';

// Union type for assignable entities (students and teachers)
export type AssignableEntity =
  { type: 'student'; data: Student } | { type: 'teacher'; data: Teacher };

export interface StudentFilterState {
  gradeFilter: string | null;
  sectionFilter: string | null;
  groupFilter: string | null;
  showStaffOnly: boolean;
}

// Derive available grades from student school_class (e.g. "3C" → grade "3")
export function deriveAvailableGrades(entities: AssignableEntity[]): string[] {
  const grades = new Set<string>();
  entities.forEach(e => {
    if (e.type === 'student' && e.data.school_class) {
      const grade = /^(\d+)/.exec(e.data.school_class)?.[1];
      if (grade) grades.add(grade);
    }
  });
  return Array.from(grades).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
}

// Derive available sections within the selected grade (e.g. "3C" → section "C")
export function deriveAvailableSections(
  entities: AssignableEntity[],
  gradeFilter: string | null
): string[] {
  if (!gradeFilter) return [];
  const sections = new Set<string>();
  entities.forEach(e => {
    if (e.type === 'student' && e.data.school_class) {
      const match = /^(\d+)(.*)/.exec(e.data.school_class);
      if (match?.[1] === gradeFilter && match[2]) {
        sections.add(match[2]);
      }
    }
  });
  return Array.from(sections).sort((a, b) => a.localeCompare(b, 'de'));
}

// Derive all available OGS groups
export function deriveAvailableGroups(entities: AssignableEntity[]): string[] {
  const groups = new Set<string>();
  entities.forEach(e => {
    if (e.type === 'student' && e.data.group_name) groups.add(e.data.group_name);
  });
  return Array.from(groups).sort((a, b) => a.localeCompare(b, 'de'));
}

// Combined filter logic: grade, section, group, staff-only — sorted by name
export function filterAndSortEntities(
  entities: AssignableEntity[],
  { gradeFilter, sectionFilter, groupFilter, showStaffOnly }: StudentFilterState
): AssignableEntity[] {
  const filtered = entities.filter(e => {
    if (showStaffOnly) return e.type === 'teacher';

    if (gradeFilter || sectionFilter || groupFilter) {
      if (e.type === 'teacher') return false;
      const student = e.data;

      if (gradeFilter) {
        const grade = /^(\d+)/.exec(student.school_class ?? '')?.[1];
        if (grade !== gradeFilter) return false;
      }
      if (sectionFilter) {
        const section = /^\d+(.*)/.exec(student.school_class ?? '')?.[1];
        if (section !== sectionFilter) return false;
      }
      if (groupFilter) {
        if (student.group_name !== groupFilter) return false;
      }
    }
    return true;
  });

  return filtered.sort((a, b) => {
    const an =
      a.type === 'student' ? `${a.data.last_name} ${a.data.first_name}` : a.data.display_name;
    const bn =
      b.type === 'student' ? `${b.data.last_name} ${b.data.first_name}` : b.data.display_name;
    return an.localeCompare(bn, 'de');
  });
}

/**
 * View-model hook for the 4-dimensional entity filter on the student selection page:
 * grade, section (within grade), OGS group, and staff-only. Owns the filter state,
 * the derived option lists, and the handler interplay (e.g. selecting a grade clears
 * the staff-only toggle).
 */
export function useStudentFilter(entities: AssignableEntity[]) {
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [showStaffOnly, setShowStaffOnly] = useState(false);

  const availableGrades = useMemo(() => deriveAvailableGrades(entities), [entities]);

  const availableSections = useMemo(
    () => deriveAvailableSections(entities, gradeFilter),
    [entities, gradeFilter]
  );

  const availableGroups = useMemo(() => deriveAvailableGroups(entities), [entities]);

  const filteredEntities = useMemo(
    () =>
      filterAndSortEntities(entities, { gradeFilter, sectionFilter, groupFilter, showStaffOnly }),
    [entities, gradeFilter, sectionFilter, groupFilter, showStaffOnly]
  );

  const noFiltersActive = !gradeFilter && !sectionFilter && !groupFilter && !showStaffOnly;

  const resetAll = () => {
    setGradeFilter(null);
    setSectionFilter(null);
    setGroupFilter(null);
    setShowStaffOnly(false);
  };

  const toggleStaffOnly = () => {
    if (showStaffOnly) {
      setShowStaffOnly(false);
    } else {
      setShowStaffOnly(true);
      setGradeFilter(null);
      setSectionFilter(null);
      setGroupFilter(null);
    }
  };

  const selectGrade = (grade: string) => {
    if (gradeFilter === grade) {
      setGradeFilter(null);
      setSectionFilter(null);
    } else {
      setGradeFilter(grade);
      setSectionFilter(null);
      setShowStaffOnly(false);
    }
  };

  const selectSection = (section: string) => {
    setSectionFilter(sectionFilter === section ? null : section);
  };

  const selectGroup = (group: string) => {
    setGroupFilter(group);
    setShowStaffOnly(false);
  };

  const clearGroupFilter = () => {
    setGroupFilter(null);
  };

  return {
    gradeFilter,
    sectionFilter,
    groupFilter,
    showStaffOnly,
    availableGrades,
    availableSections,
    availableGroups,
    filteredEntities,
    noFiltersActive,
    resetAll,
    toggleStaffOnly,
    selectGrade,
    selectSection,
    selectGroup,
    clearGroupFilter,
  };
}
