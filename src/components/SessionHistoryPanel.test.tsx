import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { SessionHistoryEntry, SessionSettings } from '../services/sessionStorage';
import { useUserStore } from '../store/userStore';

import { SessionHistoryPanel } from './SessionHistoryPanel';

const makeEntry = (overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry => ({
  activity_id: 1,
  room_id: 2,
  supervisor_ids: [3],
  saved_at: '2026-08-10T14:30:00Z',
  activity_name: 'Fußball',
  room_name: 'Turnhalle',
  supervisor_names: ['Frau Müller'],
  ...overrides,
});

const settingsWith = (entries: SessionHistoryEntry[]): SessionSettings => ({
  auto_save_enabled: true,
  session_history: entries,
});

describe('SessionHistoryPanel', () => {
  const onSelect = vi.fn();
  const removeSessionHistoryEntry = vi.fn(() => Promise.resolve());
  const clearSessionHistory = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({
      sessionSettings: settingsWith([makeEntry()]),
      removeSessionHistoryEntry,
      clearSessionHistory,
    });
  });

  it('renders nothing when there are no settings', () => {
    useUserStore.setState({ sessionSettings: null });
    const { container } = render(<SessionHistoryPanel onSelect={onSelect} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the history is empty', () => {
    useUserStore.setState({ sessionSettings: settingsWith([]) });
    const { container } = render(<SessionHistoryPanel onSelect={onSelect} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the collapsed pill without the entry list', () => {
    render(<SessionHistoryPanel onSelect={onSelect} />);
    expect(screen.getByText('Letzte Aufsichten')).toBeInTheDocument();
    expect(screen.queryByText('Fußball')).not.toBeInTheDocument();
  });

  it('expands on click and lists activity, room and supervisors', async () => {
    const user = userEvent.setup();
    render(<SessionHistoryPanel onSelect={onSelect} />);

    await user.click(screen.getByText('Letzte Aufsichten'));

    expect(screen.getByText('Fußball')).toBeInTheDocument();
    expect(screen.getByText(/Turnhalle/)).toBeInTheDocument();
    expect(screen.getByText(/Frau Müller/)).toBeInTheDocument();
  });

  it('calls onSelect with the entry and collapses the panel', async () => {
    const entry = makeEntry();
    const user = userEvent.setup();
    render(<SessionHistoryPanel onSelect={onSelect} />);

    await user.click(screen.getByText('Letzte Aufsichten'));
    await user.click(screen.getByText('Fußball'));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ activity_id: entry.activity_id })
    );
    expect(screen.queryByText('Fußball')).not.toBeInTheDocument();
  });

  it('does not select entries while disabled', async () => {
    const user = userEvent.setup();
    render(<SessionHistoryPanel onSelect={onSelect} disabled />);

    await user.click(screen.getByText('Letzte Aufsichten'));
    await user.click(screen.getByText('Fußball'));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('removes a single entry via its delete button', async () => {
    const user = userEvent.setup();
    render(<SessionHistoryPanel onSelect={onSelect} />);

    await user.click(screen.getByText('Letzte Aufsichten'));
    await user.click(screen.getByLabelText('Eintrag löschen'));

    expect(removeSessionHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ activity_id: 1 })
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clears the whole history via "Alle löschen"', async () => {
    const user = userEvent.setup();
    render(<SessionHistoryPanel onSelect={onSelect} />);

    await user.click(screen.getByText('Letzte Aufsichten'));
    await user.click(screen.getByText('Alle löschen'));

    expect(clearSessionHistory).toHaveBeenCalled();
  });

  it('renders multiple entries in stored order', async () => {
    useUserStore.setState({
      sessionSettings: settingsWith([
        makeEntry({ activity_id: 1, activity_name: 'Fußball' }),
        makeEntry({ activity_id: 2, activity_name: 'Basteln' }),
      ]),
    });
    const user = userEvent.setup();
    render(<SessionHistoryPanel onSelect={onSelect} />);

    await user.click(screen.getByText('Letzte Aufsichten'));

    const first = screen.getByText('Fußball');
    const second = screen.getByText('Basteln');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
