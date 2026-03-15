import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { api, type Student, type Teacher } from '../services/api';
import { useUserStore } from '../store/userStore';

import StudentSelectionPage from './StudentSelectionPage';

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

describe('StudentSelectionPage', () => {
  beforeEach(() => {
    useUserStore.setState({
      authenticatedUser: {
        staffId: 1,
        staffName: 'Test User',
        deviceName: 'Test Device',
        authenticatedAt: new Date(),
        pin: '1234',
      },
      selectedSupervisors: [],
    });
    // Reset to empty defaults before each test
    mockedApi.getStudents.mockResolvedValue([]);
    mockedApi.getTeachers.mockResolvedValue([]);
  });

  it('renders without crashing with location state', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
  });

  it('shows the page title', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Person auswählen')).toBeInTheDocument();
  });

  it('returns null when not authenticated', () => {
    useUserStore.setState({ authenticatedUser: null });
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no scanned tag in state', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection' }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows student names after fetch resolves', async () => {
    mockedApi.getStudents.mockResolvedValue(mockStudents.slice(0, 3));
    mockedApi.getTeachers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    // Students are sorted by last name: Müller, Schmidt, Weber
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
    expect(screen.getByText('Clara Weber')).toBeInTheDocument();
  });

  it('shows school class as badge on student cards', async () => {
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('3A')).toBeInTheDocument();
    });
  });

  it('shows teacher with "Betreuer" badge', async () => {
    mockedApi.getStudents.mockResolvedValue([]);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Frau Hoffmann')).toBeInTheDocument();
    });
    // "Betreuer" appears both as filter chip and badge on the card — verify at least 2 present
    const betreuerElements = screen.getAllByText('Betreuer');
    expect(betreuerElements.length).toBeGreaterThanOrEqual(2);
  });

  it('shows empty state when no entities are returned', async () => {
    mockedApi.getStudents.mockResolvedValue([]);
    mockedApi.getTeachers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Keine Personen gefunden')).toBeInTheDocument();
    });
    expect(screen.getByText('Es sind keine Schüler oder Betreuer verfügbar.')).toBeInTheDocument();
  });

  it('shows pagination controls when more than 5 entities', async () => {
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    // Wait for entities to load — 7 total items means 2 pages
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Page indicator uses format "Seite X von Y"
    expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument();
  });

  it('navigates to second page when next button is clicked', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument();
    });

    // Click the "Nächste" button to go to page 2
    const nextButton = screen.getByText('Nächste');
    await user.click(nextButton);

    expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument();
  });

  it('shows "Armband zuweisen" button', async () => {
    mockedApi.getStudents.mockResolvedValue([mockStudents[0]]);
    mockedApi.getTeachers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Armband zuweisen')).toBeInTheDocument();
    });
  });

  it('has back button present', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );
    // BackButton renders with aria-label "Zurück" by default
    expect(screen.getByLabelText('Zurück')).toBeInTheDocument();
  });

  it('shows grade filter chips derived from student classes', async () => {
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    // Wait for data to load — grades 1, 2, 3, 4 should appear as filter chips
    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // The "Alle" and "Betreuer" filter chips should be present
    expect(screen.getByText('Alle')).toBeInTheDocument();
    expect(screen.getByText('Betreuer')).toBeInTheDocument();

    // Grade numbers from student classes
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('filters students by grade when a grade chip is clicked', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // Click grade "3" filter — should show only 3A and 3B students
    const grade3Chip = screen.getByText('3');
    await user.click(grade3Chip);

    // Anna Müller (3A) and Ben Schmidt (3B) should be visible
    expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();

    // Clara Weber (4A) should not be visible
    expect(screen.queryByText('Clara Weber')).not.toBeInTheDocument();
    // Teacher should also not appear when grade filter active
    expect(screen.queryByText('Frau Hoffmann')).not.toBeInTheDocument();
  });

  it('shows "Betreuer" filter to show only staff', async () => {
    const user = userEvent.setup();
    mockedApi.getStudents.mockResolvedValue(mockStudents.slice(0, 2));
    mockedApi.getTeachers.mockResolvedValue(mockTeachers);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // "Betreuer" appears as both a filter chip and a badge — click the first one (filter chip)
    const betreuerElements = screen.getAllByText('Betreuer');
    await user.click(betreuerElements[0]);

    // Only teacher should appear
    await waitFor(() => {
      expect(screen.getByText('Frau Hoffmann')).toBeInTheDocument();
    });
    expect(screen.queryByText('Anna Müller')).not.toBeInTheDocument();
  });

  it('shows OGS-Gruppe filter section', async () => {
    mockedApi.getStudents.mockResolvedValue(mockStudents);
    mockedApi.getTeachers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    });

    // The group filter section label should be present
    expect(screen.getByText('OGS-Gruppe:')).toBeInTheDocument();
    // "Alle Gruppen" may appear in both the filter bar and the group picker modal
    const alleGruppenElements = screen.getAllByText('Alle Gruppen');
    expect(alleGruppenElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error modal on fetch failure', async () => {
    mockedApi.getStudents.mockRejectedValue(new Error('Network error'));
    mockedApi.getTeachers.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/student-selection', state: locationState }]}>
        <StudentSelectionPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Fehler beim Laden/)).toBeInTheDocument();
    });
  });
});
