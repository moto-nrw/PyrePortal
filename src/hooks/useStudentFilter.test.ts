import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type AssignableEntity,
  deriveAvailableGrades,
  deriveAvailableGroups,
  deriveAvailableSections,
  filterAndSortEntities,
  useStudentFilter,
} from './useStudentFilter';

const student = (
  id: number,
  firstName: string,
  lastName: string,
  schoolClass: string,
  groupName: string
): AssignableEntity => ({
  type: 'student',
  data: {
    student_id: id,
    person_id: id,
    first_name: firstName,
    last_name: lastName,
    school_class: schoolClass,
    group_name: groupName,
  },
});

const teacher = (id: number, displayName: string): AssignableEntity => ({
  type: 'teacher',
  data: {
    staff_id: id,
    person_id: id,
    first_name: '',
    last_name: '',
    display_name: displayName,
  },
});

const entities: AssignableEntity[] = [
  student(1, 'Anna', 'Zimmer', '3C', 'Delfine'),
  student(2, 'Ben', 'Adler', '3A', 'Füchse'),
  student(3, 'Clara', 'Meier', '10B', 'Delfine'),
  student(4, 'David', 'Koch', '1A', 'Füchse'),
  teacher(5, 'Frau Müller'),
];

describe('deriveAvailableGrades', () => {
  it('derives unique grades from school_class with numeric sorting', () => {
    expect(deriveAvailableGrades(entities)).toEqual(['1', '3', '10']);
  });

  it('ignores teachers and classes without a leading digit', () => {
    const input = [student(1, 'A', 'B', 'Vorschule', 'G'), teacher(2, 'X')];
    expect(deriveAvailableGrades(input)).toEqual([]);
  });
});

describe('deriveAvailableSections', () => {
  it('returns sections of the selected grade only', () => {
    expect(deriveAvailableSections(entities, '3')).toEqual(['A', 'C']);
  });

  it('returns empty list without a grade filter', () => {
    expect(deriveAvailableSections(entities, null)).toEqual([]);
  });

  it('excludes classes without a section suffix', () => {
    const input = [student(1, 'A', 'B', '3', 'G'), student(2, 'C', 'D', '3B', 'G')];
    expect(deriveAvailableSections(input, '3')).toEqual(['B']);
  });
});

describe('deriveAvailableGroups', () => {
  it('derives unique sorted group names from students', () => {
    expect(deriveAvailableGroups(entities)).toEqual(['Delfine', 'Füchse']);
  });

  it('ignores empty group names', () => {
    const input = [student(1, 'A', 'B', '3C', '')];
    expect(deriveAvailableGroups(input)).toEqual([]);
  });
});

describe('filterAndSortEntities', () => {
  const noFilters = {
    gradeFilter: null,
    sectionFilter: null,
    groupFilter: null,
    showStaffOnly: false,
  };

  const names = (result: AssignableEntity[]) =>
    result.map(e => (e.type === 'student' ? e.data.first_name : e.data.display_name));

  it('returns all entities sorted by name when no filter is active', () => {
    // Students sort by "last_name first_name", teachers by display_name
    expect(names(filterAndSortEntities(entities, noFilters))).toEqual([
      'Ben', // Adler
      'Frau Müller',
      'David', // Koch
      'Clara', // Meier
      'Anna', // Zimmer
    ]);
  });

  it('shows only teachers when showStaffOnly is active', () => {
    const result = filterAndSortEntities(entities, { ...noFilters, showStaffOnly: true });
    expect(names(result)).toEqual(['Frau Müller']);
  });

  it('filters students by grade and excludes teachers', () => {
    const result = filterAndSortEntities(entities, { ...noFilters, gradeFilter: '3' });
    expect(names(result)).toEqual(['Ben', 'Anna']);
  });

  it('filters by grade and section combined', () => {
    const result = filterAndSortEntities(entities, {
      ...noFilters,
      gradeFilter: '3',
      sectionFilter: 'C',
    });
    expect(names(result)).toEqual(['Anna']);
  });

  it('filters by group', () => {
    const result = filterAndSortEntities(entities, { ...noFilters, groupFilter: 'Delfine' });
    expect(names(result)).toEqual(['Clara', 'Anna']);
  });

  it('applies grade, section and group filters together', () => {
    const result = filterAndSortEntities(entities, {
      ...noFilters,
      gradeFilter: '3',
      sectionFilter: 'C',
      groupFilter: 'Füchse',
    });
    expect(names(result)).toEqual([]);
  });

  it('distinguishes grade 1 from grade 10', () => {
    const result = filterAndSortEntities(entities, { ...noFilters, gradeFilter: '1' });
    expect(names(result)).toEqual(['David']);
  });
});

describe('useStudentFilter', () => {
  it('starts with no active filters', () => {
    const { result } = renderHook(() => useStudentFilter(entities));
    expect(result.current.noFiltersActive).toBe(true);
    expect(result.current.filteredEntities).toHaveLength(5);
  });

  it('selecting a grade clears the staff-only toggle', () => {
    const { result } = renderHook(() => useStudentFilter(entities));

    act(() => result.current.toggleStaffOnly());
    expect(result.current.showStaffOnly).toBe(true);

    act(() => result.current.selectGrade('3'));
    expect(result.current.gradeFilter).toBe('3');
    expect(result.current.showStaffOnly).toBe(false);
  });

  it('selecting the same grade again clears grade and section', () => {
    const { result } = renderHook(() => useStudentFilter(entities));

    act(() => result.current.selectGrade('3'));
    act(() => result.current.selectSection('C'));
    expect(result.current.sectionFilter).toBe('C');

    act(() => result.current.selectGrade('3'));
    expect(result.current.gradeFilter).toBeNull();
    expect(result.current.sectionFilter).toBeNull();
  });

  it('switching the grade clears the section', () => {
    const { result } = renderHook(() => useStudentFilter(entities));

    act(() => result.current.selectGrade('3'));
    act(() => result.current.selectSection('C'));

    act(() => result.current.selectGrade('1'));
    expect(result.current.gradeFilter).toBe('1');
    expect(result.current.sectionFilter).toBeNull();
  });

  it('selecting a section again toggles it off', () => {
    const { result } = renderHook(() => useStudentFilter(entities));

    act(() => result.current.selectGrade('3'));
    act(() => result.current.selectSection('C'));
    act(() => result.current.selectSection('C'));
    expect(result.current.sectionFilter).toBeNull();
  });

  it('activating staff-only clears grade, section and group filters', () => {
    const { result } = renderHook(() => useStudentFilter(entities));

    act(() => result.current.selectGrade('3'));
    act(() => result.current.selectSection('C'));
    act(() => result.current.selectGroup('Delfine'));

    act(() => result.current.toggleStaffOnly());
    expect(result.current.showStaffOnly).toBe(true);
    expect(result.current.gradeFilter).toBeNull();
    expect(result.current.sectionFilter).toBeNull();
    expect(result.current.groupFilter).toBeNull();
  });

  it('selecting a group clears the staff-only toggle', () => {
    const { result } = renderHook(() => useStudentFilter(entities));

    act(() => result.current.toggleStaffOnly());
    act(() => result.current.selectGroup('Delfine'));
    expect(result.current.groupFilter).toBe('Delfine');
    expect(result.current.showStaffOnly).toBe(false);
  });

  it('clearGroupFilter only clears the group filter', () => {
    const { result } = renderHook(() => useStudentFilter(entities));

    act(() => result.current.selectGrade('3'));
    act(() => result.current.selectGroup('Delfine'));
    act(() => result.current.clearGroupFilter());
    expect(result.current.groupFilter).toBeNull();
    expect(result.current.gradeFilter).toBe('3');
  });

  it('resetAll clears every filter', () => {
    const { result } = renderHook(() => useStudentFilter(entities));

    act(() => result.current.selectGrade('3'));
    act(() => result.current.selectSection('C'));
    act(() => result.current.selectGroup('Delfine'));
    act(() => result.current.resetAll());

    expect(result.current.noFiltersActive).toBe(true);
    expect(result.current.filteredEntities).toHaveLength(5);
  });
});
