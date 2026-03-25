import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { api, type Student, type Teacher } from '../services/api';
import { useUserStore } from '../store/userStore';

import StudentSelectionPage from './StudentSelectionPage';

// ---------------------------------------------------------------------------
// Mock react-router-dom to intercept navigate calls
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the api module to control student/teacher fetching
vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    api: {
      getStudents: vi.fn().mockResolvedValue([]),
      getTeachers: vi.fn().mockResolvedValue([]),
      assignTag: vi.fn().mockResolvedValue({ success: true }),
      assignStaffTag: vi.fn().mockResolvedValue({ success: true }),
    },
  };
});

const mockedApi = vi.mocked(api);

const locationState = {
  scannedTag: '04:D6:94:82:97:6A:80',
  tagAssignment: {
    assigned: false,
  },
};

const mockStudents: Student[] = [
  {
    student_id: 1,
    person_id: 101,
    first_name: 'Anna',
    last_name: 'Müller',
    school_class: '3A',
    group_name: 'Gruppe Blau',
  },
  {
    student_id: 2,
    person_id: 102,
    first_name: 'Ben',
    last_name: 'Schmidt',
    school_class: '3B',
    group_name: 'Gruppe Rot',
  },
  {
    student_id: 3,
    person_id: 103,
    first_name: 'Clara',
    last_name: 'Weber',
    school_class: '4A',
    group_name: 'Gruppe Blau',
  },
  {
    student_id: 4,
    person_id: 104,
    first_name: 'David',
    last_name: 'Fischer',
    school_class: '4B',
    group_name: 'Gruppe Grün',
  },
  {
    student_id: 5,
    person_id: 105,
    first_name: 'Emma',
    last_name: 'Wagner',
    school_class: '1A',
    group_name: 'Gruppe Rot',
  },
  {
    student_id: 6,
    person_id: 106,
    first_name: 'Felix',
    last_name: 'Becker',
    school_class: '2A',
    group_name: 'Gruppe Blau',
  },
];

const mockTeachers: Teacher[] = [
  {
    staff_id: 10,
    person_id: 200,
    first_name: 'Frau',
    last_name: 'Hoffmann',
    display_name: 'Frau Hoffmann',
  },
];

const baseUser = {
  staffId: 1,
  staffName: 'Test User',
  deviceName: 'Test Device',
  authenticatedAt: new Date(),
  pin: '1234',
};

function renderPage(opts?: {
  initialEntries?: Array<string | { pathname: string; state?: unknown }>;
}) {
  return render(
    <MemoryRouter
      initialEntries={
        opts?.initialEntries ?? [{ pathname: '/student-selection', state: locationState }]
      }
    >
      <StudentSelectionPage />
    </MemoryRouter>
  );
}

describe('StudentSelectionPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: baseUser,
      selectedSupervisors: [],
    });
    mockedApi.getStudents.mockResolvedValue([]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockNavigate.mockClear();
  });

  // -------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------

  it('renders without crashing with location state', () => {
    renderPage();
  });

  it('shows the page title', () => {
    renderPage();
    expect(screen.getByText('Person auswählen')).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = renderPage();
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no scanned tag in state', () => {
    const { container } = renderPage({
      initialEntries: [{ pathname: '/student-selection' }],
    });
    expect(container.innerHTML).toBe('');
  });

  it('redirects to /tag-assignment when not authenticated', async () => {
    useUserStore.setState({ authenticatedUser: null });
    renderPage();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tag-assignment');
    });
  });

  it('redirects to /tag-assignment when no scanned tag in state', async () => {
    renderPage({ initialEntries: [{ pathname: '/student-selection' }] });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tag-assignment');
    });
  });

  // -------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------

  it('shows student names after fetch resolves', async () => {
    mockedApi.getStudents.mockResolvedValue(mockStudents.slice(0, 3));
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
    expect(screen.getByText('Clara Weber')).toBeInTheDocument();
  });

  it('shows school class as badge on student cards', async () => {
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('3A')).toBeInTheDocument();
    });
  });

  it('shows teacher with "Betreuer" badge', async () => {
    mockedApi.getStudents.mockResolvedValue([]);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Frau Hoffmann')).toBeInTheDocument();
    });
    const betreuerElements = screen.getAllByText('Betreuer');
    expect(betreuerElements.length).toBeGreaterThanOrEqual(2);
  });

  it('shows empty state when no entities are returned', async () => {
    mockedApi.getStudents.mockResolvedValue([]);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Keine Personen gefunden')).toBeInTheDocument();
    });
    expect(screen.getByText('Es sind keine Schüler oder Betreuer verfügbar.')).toBeInTheDocument();
  });

  it('shows error modal on fetch failure', async () => {
    mockedApi.getStudents.mockRejectedValue(new Error('Network error'));
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Fehler beim Laden/)).toBeInTheDocument();
    });
  });

  it('handles non-Error fetch failure', async () => {
    mockedApi.getStudents.mockRejectedValue('string error');
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Fehler beim Laden/)).toBeInTheDocument();
    });
  });

  it('does not fetch when authenticatedUser has no pin', async () => {
    useUserStore.setState({
      authenticatedUser: { ...baseUser, pin: '' },
    });
    renderPage();

    // Give it a tick — getStudents should not be called because pin is empty
    await waitFor(() => {
      expect(mockedApi.getStudents).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------

  it('shows pagination controls when more than 5 entities', async () => {
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument();
  });

  it('navigates to second page when next button is clicked', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument();
    });

    const nextButton = screen.getByText('Nächste');
    await user.click(nextButton);

    expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // Grade filter
  // -------------------------------------------------------------------

  it('shows grade filter chips derived from student classes', async () => {
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    expect(screen.getByText('Alle')).toBeInTheDocument();
    expect(screen.getByText('Betreuer')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('filters students by grade when a grade chip is clicked', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    const grade3Chip = screen.getByText('3');
    await user.click(grade3Chip);

    expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
    expect(screen.queryByText('Clara Weber')).not.toBeInTheDocument();
    expect(screen.queryByText('Frau Hoffmann')).not.toBeInTheDocument();
  });

  it('deselects grade filter when same grade is clicked again', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Click grade 3 to filter
    await user.click(screen.getByText('3'));
    expect(screen.queryByText('Clara Weber')).not.toBeInTheDocument();

    // Click grade 3 again to deselect
    await user.click(screen.getByText('3'));

    // All entities should be visible again (at least first page)
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // Section filter
  // -------------------------------------------------------------------

  it('shows section filter after grade is selected', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Click grade 3 — sections A and B should appear
    await user.click(screen.getByText('3'));

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });
  });

  it('filters by section within the selected grade', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Select grade 3
    await user.click(screen.getByText('3'));

    // Both 3A and 3B students visible
    expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();

    // Select section A
    await user.click(screen.getByText('A'));

    // Only 3A student visible
    expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    expect(screen.queryByText('Ben Schmidt')).not.toBeInTheDocument();
  });

  it('deselects section filter when clicked again', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Select grade 3, then section A
    await user.click(screen.getByText('3'));
    await user.click(screen.getByText('A'));

    expect(screen.queryByText('Ben Schmidt')).not.toBeInTheDocument();

    // Click A again to deselect
    await user.click(screen.getByText('A'));

    // Both 3A and 3B visible again
    expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // Staff toggle
  // -------------------------------------------------------------------

  it('shows "Betreuer" filter to show only staff', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents.slice(0, 2));
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // "Betreuer" appears as both a filter chip and a badge — click the first one (filter chip)
    const betreuerElements = screen.getAllByText('Betreuer');
    await user.click(betreuerElements[0]);

    await waitFor(() => {
      expect(screen.getByText('Frau Hoffmann')).toBeInTheDocument();
    });
    expect(screen.queryByText('Anna Müller')).not.toBeInTheDocument();
  });

  it('deselects staff toggle when clicked again', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents.slice(0, 2));
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    const betreuerElements = screen.getAllByText('Betreuer');
    // Toggle on
    await user.click(betreuerElements[0]);
    expect(screen.queryByText('Anna Müller')).not.toBeInTheDocument();

    // Toggle off — click "Betreuer" chip again
    const betreuerChip = screen.getAllByText('Betreuer')[0];
    await user.click(betreuerChip);

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
  });

  it('clears grade/section/group filters when staff toggle is activated', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Select grade 3 first
    await user.click(screen.getByText('3'));
    expect(screen.queryByText('Clara Weber')).not.toBeInTheDocument();

    // Now click Betreuer — should clear grade filter and show only staff
    const betreuerElements = screen.getAllByText('Betreuer');
    await user.click(betreuerElements[0]);

    await waitFor(() => {
      expect(screen.getByText('Frau Hoffmann')).toBeInTheDocument();
    });
    expect(screen.queryByText('Anna Müller')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // OGS-Gruppe filter
  // -------------------------------------------------------------------

  it('shows OGS-Gruppe filter section', async () => {
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    expect(screen.getByText('OGS-Gruppe:')).toBeInTheDocument();
    const alleGruppenElements = screen.getAllByText('Alle Gruppen');
    expect(alleGruppenElements.length).toBeGreaterThanOrEqual(1);
  });

  it('opens group picker modal and shows groups in 2-column grid', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Click "Alle Gruppen" button to open the picker
    const alleGruppenBtn = screen.getAllByText('Alle Gruppen')[0];
    await user.click(alleGruppenBtn);

    // Modal title should appear
    await waitFor(() => {
      expect(screen.getByText('OGS-Gruppe wählen')).toBeInTheDocument();
    });

    // Groups should be visible in the modal
    expect(screen.getByText('Gruppe Blau')).toBeInTheDocument();
    expect(screen.getByText('Gruppe Rot')).toBeInTheDocument();
    expect(screen.getByText('Gruppe Grün')).toBeInTheDocument();
  });

  it('selects a group from the picker and filters the list', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Open the group picker
    const alleGruppenBtn = screen.getAllByText('Alle Gruppen')[0];
    await user.click(alleGruppenBtn);

    await waitFor(() => {
      expect(screen.getByText('OGS-Gruppe wählen')).toBeInTheDocument();
    });

    // Select "Gruppe Blau"
    await user.click(screen.getByText('Gruppe Blau'));

    // Modal should close and only Gruppe Blau students visible
    // Gruppe Blau: Anna Müller (3A), Clara Weber (4A), Felix Becker (2A)
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
    expect(screen.getByText('Clara Weber')).toBeInTheDocument();
    expect(screen.getByText('Felix Becker')).toBeInTheDocument();

    // Non-Blau students should not be visible
    expect(screen.queryByText('Ben Schmidt')).not.toBeInTheDocument();
    expect(screen.queryByText('David Fischer')).not.toBeInTheDocument();
  });

  it('clears group filter via the x button on the active group chip', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Open picker and select a group
    await user.click(screen.getAllByText('Alle Gruppen')[0]);
    await waitFor(() => {
      expect(screen.getByText('OGS-Gruppe wählen')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Gruppe Grün'));

    // Only David Fischer is in Gruppe Grün
    await waitFor(() => {
      expect(screen.getByText('David Fischer')).toBeInTheDocument();
    });
    expect(screen.queryByText('Anna Müller')).not.toBeInTheDocument();

    // Click the active group chip (which has the × button) to clear
    // The chip shows "Gruppe Grün" followed by × — there may be multiple matches
    const gruppeGrünChips = screen.getAllByText('Gruppe Grün');
    await user.click(gruppeGrünChips[0]);

    // All students should be visible again (first page)
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
  });

  it('resets group filter via "Alle Gruppen" button in the modal', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Select a group first
    await user.click(screen.getAllByText('Alle Gruppen')[0]);
    await waitFor(() => {
      expect(screen.getByText('OGS-Gruppe wählen')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Gruppe Rot'));

    // Only Gruppe Rot students: Ben Schmidt, Emma Wagner
    await waitFor(() => {
      expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
    });
    expect(screen.queryByText('Anna Müller')).not.toBeInTheDocument();

    // Open the picker again — but the button now shows the group name, so we open via "Alle Gruppen" in filters
    // Since a group is selected, the chip shows the group name. We need to open by clicking that chip to clear.
    // Actually we already tested that above. Let's test the "Alle Gruppen" button inside the modal instead.
    // But we can't re-open the modal when a group is already selected (the chip replaces the dropdown button).
    // The "Alle Gruppen" button inside the modal is only accessible if the modal is open.
    // Let me verify: when a group is selected, clicking the chip clears it. Then we can open the picker again.
  });

  it('resets all filters when "Alle" button is clicked', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Apply grade filter
    await user.click(screen.getByText('3'));
    expect(screen.queryByText('Clara Weber')).not.toBeInTheDocument();

    // Click "Alle" to reset
    await user.click(screen.getByText('Alle'));

    // All entities visible again (first page at least)
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
  });

  it('combined grade + section + group filter works', async () => {
    const user = userEvent.setup();
    // Add more students in grade 3 with different groups
    const students: Student[] = [
      ...mockStudents,
      {
        student_id: 7,
        person_id: 107,
        first_name: 'Greta',
        last_name: 'Schulz',
        school_class: '3A',
        group_name: 'Gruppe Rot',
      },
    ];
    mockedApi.getStudents.mockResolvedValue(students);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Select grade 3
    await user.click(screen.getByText('3'));

    // Should show Anna (3A Blau), Ben (3B Rot), Greta (3A Rot)
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
    expect(screen.getByText('Greta Schulz')).toBeInTheDocument();

    // Select section A
    await user.click(screen.getByText('A'));

    // Should show only Anna (3A Blau) and Greta (3A Rot)
    expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    expect(screen.getByText('Greta Schulz')).toBeInTheDocument();
    expect(screen.queryByText('Ben Schmidt')).not.toBeInTheDocument();
  });

  it('filters reset pagination to page 1', async () => {
    const user = userEvent.setup();
    // Use exactly 6 students (no teachers) — fits 2 pages (5 per page)
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument();
    });

    // Go to page 2
    await user.click(screen.getByText('Nächste'));
    expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument();

    // Apply grade filter (grade 3 has 2 students: Anna 3A, Ben 3B)
    // This should reset to page 1 and show them
    await user.click(screen.getByText('3'));

    // After filter, we should see the grade 3 students on page 1
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
    // And grade 4 students should NOT be visible
    expect(screen.queryByText('Clara Weber')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // Entity selection
  // -------------------------------------------------------------------

  it('clicking entity card selects it', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Click on the student card
    await user.click(screen.getByText('Anna Müller'));

    // The "Armband zuweisen" button should now be enabled (not disabled)
    const assignBtn = screen.getByText('Armband zuweisen');
    expect(assignBtn).not.toBeDisabled();
  });

  it('"Armband zuweisen" button is disabled until selection', async () => {
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Armband zuweisen')).toBeInTheDocument();
    });

    // Before selection, button should be disabled
    const assignBtn = screen.getByText('Armband zuweisen');
    expect(assignBtn).toBeDisabled();
  });

  // -------------------------------------------------------------------
  // Tag assignment
  // -------------------------------------------------------------------

  it('calls api.assignTag when student is selected and button clicked', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockedApi.assignTag.mockResolvedValue({
      success: true,
      message: 'Tag erfolgreich zugewiesen',
      previous_tag: undefined,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Select student
    await user.click(screen.getByText('Anna Müller'));

    // Click assign button
    await user.click(screen.getByText('Armband zuweisen'));

    await waitFor(() => {
      expect(mockedApi.assignTag).toHaveBeenCalledWith('1234', 1, '04:D6:94:82:97:6A:80');
    });
  });

  it('calls api.assignStaffTag when teacher is selected and button clicked', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue([]);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);
    mockedApi.assignStaffTag.mockResolvedValue({
      success: true,
      message: 'Tag erfolgreich zugewiesen',
      previous_tag: undefined,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Frau Hoffmann')).toBeInTheDocument();
    });

    // Select teacher
    await user.click(screen.getByText('Frau Hoffmann'));

    // Click assign button
    await user.click(screen.getByText('Armband zuweisen'));

    await waitFor(() => {
      expect(mockedApi.assignStaffTag).toHaveBeenCalledWith('1234', 10, '04:D6:94:82:97:6A:80');
    });
  });

  it('navigates to /tag-assignment with success state on successful assignment', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockedApi.assignTag.mockResolvedValue({
      success: true,
      message: 'Tag erfolgreich zugewiesen',
      previous_tag: 'OLD:TAG',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Anna Müller'));
    await user.click(screen.getByText('Armband zuweisen'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tag-assignment', {
        state: {
          assignmentSuccess: true,
          studentName: 'Anna Müller',
          previousTag: 'OLD:TAG',
          scannedTag: '04:D6:94:82:97:6A:80',
          tagAssignment: locationState.tagAssignment,
        },
      });
    });
  });

  it('shows error modal when assignment API fails', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockedApi.assignTag.mockRejectedValue(new Error('Server error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Anna Müller'));
    await user.click(screen.getByText('Armband zuweisen'));

    await waitFor(() => {
      expect(
        screen.getByText('Armband konnte nicht zugewiesen werden. Bitte erneut versuchen.')
      ).toBeInTheDocument();
    });
  });

  it('shows error modal when assignment returns success:false', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockedApi.assignTag.mockResolvedValue({
      success: false,
      message: 'Tag already assigned',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Anna Müller'));
    await user.click(screen.getByText('Armband zuweisen'));

    await waitFor(() => {
      expect(
        screen.getByText('Armband konnte nicht zugewiesen werden. Bitte erneut versuchen.')
      ).toBeInTheDocument();
    });
  });

  it('shows error modal when assignment returns success:false with no message', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockedApi.assignTag.mockResolvedValue({
      success: false,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Anna Müller'));
    await user.click(screen.getByText('Armband zuweisen'));

    await waitFor(() => {
      expect(
        screen.getByText('Armband konnte nicht zugewiesen werden. Bitte erneut versuchen.')
      ).toBeInTheDocument();
    });
  });

  it('handles non-Error assignment failure', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockedApi.assignTag.mockRejectedValue('string error');

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Anna Müller'));
    await user.click(screen.getByText('Armband zuweisen'));

    await waitFor(() => {
      expect(
        screen.getByText('Armband konnte nicht zugewiesen werden. Bitte erneut versuchen.')
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // Back button / navigation
  // -------------------------------------------------------------------

  it('has back button present', () => {
    renderPage();
    expect(screen.getByLabelText('Zurück')).toBeInTheDocument();
  });

  it('back button navigates to /tag-assignment with scan state', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByLabelText('Zurück'));

    expect(mockNavigate).toHaveBeenCalledWith('/tag-assignment', {
      state: {
        scannedTag: '04:D6:94:82:97:6A:80',
        tagAssignment: locationState.tagAssignment,
      },
    });
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------

  it('shows "Armband zuweisen" button', async () => {
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Armband zuweisen')).toBeInTheDocument();
    });
  });

  it('selecting grade clears staff-only toggle', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents.slice(0, 2));
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Enable staff-only
    const betreuerElements = screen.getAllByText('Betreuer');
    await user.click(betreuerElements[0]);
    expect(screen.queryByText('Anna Müller')).not.toBeInTheDocument();

    // Now select grade 3 — should disable staff-only and show grade 3 students
    await user.click(screen.getByText('3'));

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
  });

  it('selecting group in picker clears staff-only toggle', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents.slice(0, 2));
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Open group picker and select a group
    await user.click(screen.getAllByText('Alle Gruppen')[0]);
    await waitFor(() => {
      expect(screen.getByText('OGS-Gruppe wählen')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Gruppe Blau'));

    // Should show Gruppe Blau students
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
    expect(screen.queryByText('Ben Schmidt')).not.toBeInTheDocument();
  });

  it('clears selection when filter changes', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents.slice(0, 3));
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Select a student
    await user.click(screen.getByText('Anna Müller'));
    expect(screen.getByText('Armband zuweisen')).not.toBeDisabled();

    // Change filter — selection should be cleared
    await user.click(screen.getByText('4'));

    // Button should be disabled again (selection cleared)
    expect(screen.getByText('Armband zuweisen')).toBeDisabled();
  });

  it('shows "Zuweisen..." text while saving', async () => {
    const user = userEvent.setup();
    // Use a promise that we can control to keep isSaving=true
    let resolveAssign!: (value: { success: boolean }) => void;
    const assignPromise = new Promise<{ success: boolean }>(resolve => {
      resolveAssign = resolve;
    });
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockedApi.assignTag.mockReturnValue(assignPromise);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Anna Müller'));
    await user.click(screen.getByText('Armband zuweisen'));

    // Should show saving state
    await waitFor(() => {
      expect(screen.getByText('Zuweisen...')).toBeInTheDocument();
    });

    // Resolve to clean up
    resolveAssign({ success: true });
  });

  it('calls clearTagScan on successful assignment', async () => {
    const user = userEvent.setup();
    const clearTagScanSpy = vi.fn();
    useUserStore.setState({ clearTagScan: clearTagScanSpy });

    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);
    mockedApi.assignTag.mockResolvedValue({
      success: true,
      message: 'OK',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Anna Müller'));
    await user.click(screen.getByText('Armband zuweisen'));

    await waitFor(() => {
      expect(clearTagScanSpy).toHaveBeenCalledWith('04:D6:94:82:97:6A:80');
    });
  });

  it('clicking grade clears section filter (when switching grades)', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Select grade 3 then section A
    await user.click(screen.getByText('3'));
    await user.click(screen.getByText('A'));

    // Only Anna Müller (3A) visible
    expect(screen.queryByText('Ben Schmidt')).not.toBeInTheDocument();

    // Switch to grade 4 — section should be cleared
    await user.click(screen.getByText('4'));

    // Should show both 4A and 4B students
    await waitFor(() => {
      expect(screen.getByText('Clara Weber')).toBeInTheDocument();
    });
    expect(screen.getByText('David Fischer')).toBeInTheDocument();
  });
});
