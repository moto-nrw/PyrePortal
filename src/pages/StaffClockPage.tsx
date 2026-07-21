import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { adapter } from '@platform';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal, ModalBase } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import {
  ApiError,
  api,
  mapApiErrorToGerman,
  type StaffClockAction,
  type StaffClockCommand,
  type StaffClockState,
  type WorkSessionStatus,
} from '../services/api';
import { useUserStore } from '../store/userStore';
import { designSystem } from '../styles/designSystem';
import { getSecureRandomInt } from '../utils/crypto';
import { createLogger, logNavigation, logUserAction, serializeError } from '../utils/logger';
import { isRfidEnabled } from '../utils/tauriContext';

const logger = createLogger('StaffClockPage');
const SCAN_TIMEOUT_MS = 20_000;

const stateLabels: Record<StaffClockState['state'], string> = {
  checked_out: 'Ausgestempelt',
  checked_in: 'Eingestempelt',
  on_break: 'In Pause',
};

const actionLabels: Record<StaffClockAction, string> = {
  checkin: 'Einstempeln',
  checkout: 'Ausstempeln',
  break_start: 'Pause starten',
  break_end: 'Pause beenden',
};

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} Std. ${rest} Min.` : `${rest} Min.`;
}

function isRealScanningEnabled(): boolean {
  return adapter.platform === 'gkt' || isRfidEnabled();
}

async function scanStaffTag(): Promise<string> {
  if (!isRealScanningEnabled()) {
    const configuredTags = (import.meta.env.VITE_MOCK_RFID_TAGS as string | undefined)
      ?.split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
    const tags = configuredTags?.length ? configuredTags : ['04:D6:94:82:97:6A:80'];
    await new Promise(resolve => setTimeout(resolve, 800));
    return tags[getSecureRandomInt(tags.length)];
  }

  const result = await adapter.scanSingleTag(SCAN_TIMEOUT_MS);
  if (!result.success || !result.tag_id) {
    throw new Error(result.error ?? 'RFID-Scan fehlgeschlagen');
  }
  return result.tag_id;
}

function StaffClockPage() {
  const navigate = useNavigate();
  const authenticatedUser = useUserStore(state => state.authenticatedUser);
  const [clockState, setClockState] = useState<StaffClockState | null>(null);
  const [scannedTag, setScannedTag] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<WorkSessionStatus>('present');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<StaffClockCommand | null>(null);
  const [reason, setReason] = useState('');
  const [reasonPrompt, setReasonPrompt] = useState('');
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const showFailure = (error: unknown) => {
    logger.error('Staff clock operation failed', { error: serializeError(error) });
    let message = mapApiErrorToGerman(error);
    if (error instanceof ApiError && error.code === 'planned_start_not_reached') {
      const planned = error.details?.planned_start_time;
      if (planned) message = `Einstempeln ist erst ab ${planned} Uhr möglich.`;
    }
    setErrorMessage(message);
    setShowError(true);
  };

  const runCommand = async (command: StaffClockCommand) => {
    if (!authenticatedUser?.pin || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsBusy(true);
    try {
      const nextState = await api.executeStaffClockAction(authenticatedUser.pin, command);
      setClockState(nextState);
      setCompletedMessage(`${actionLabels[command.action]} erfolgreich`);
      setPendingCommand(null);
      setReason('');
      logUserAction('Staff clock action completed', { action: command.action });
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'deviation_reason_required' || error.code === 'reopen_status_conflict')
      ) {
        const minutes = error.details?.deviation_minutes;
        setReasonPrompt(
          error.code === 'reopen_status_conflict'
            ? 'Der gewählte Arbeitsort weicht vom heutigen Eintrag ab. Bitte begründen.'
            : `Die Stempelzeit weicht${minutes ? ` um ${minutes} Minuten` : ''} vom Dienstplan ab. Bitte begründen.`
        );
        setPendingCommand(command);
      } else {
        showFailure(error);
      }
    } finally {
      inFlightRef.current = false;
      setIsBusy(false);
    }
  };

  const handleScan = async () => {
    if (!authenticatedUser?.pin || inFlightRef.current) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    inFlightRef.current = true;
    setIsBusy(true);
    setClockState(null);
    setCompletedMessage(null);
    try {
      const tag = await scanStaffTag();
      const state = await api.getStaffClockState(authenticatedUser.pin, tag);
      if (requestId !== requestIdRef.current) return;
      setScannedTag(tag);
      setClockState(state);
      setSelectedStatus(state.session?.status ?? 'present');
      logUserAction('Staff card scanned', { staffId: state.staff_id });
    } catch (error) {
      if (requestId === requestIdRef.current) showFailure(error);
    } finally {
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false;
        setIsBusy(false);
      }
    }
  };

  const handleAction = (action: StaffClockAction) => {
    if (!scannedTag) return;
    void runCommand({
      rfid_tag: scannedTag,
      action,
      ...(action === 'checkin' ? { status: selectedStatus } : {}),
    });
  };

  const handleReasonSubmit = () => {
    const trimmed = reason.trim();
    if (!pendingCommand || !trimmed) return;
    void runCommand({ ...pendingCommand, reason: trimmed });
  };

  const handleBack = () => {
    requestIdRef.current += 1;
    logNavigation('Staff Clock', '/home');
    void navigate('/home');
  };

  return (
    <BackgroundWrapper>
      <div className="h-screen w-screen overflow-auto p-8">
        <div className="fixed left-5 top-5 z-50">
          <BackButton onClick={handleBack} disabled={isBusy} />
        </div>

        <header className="mx-auto mb-10 mt-4 max-w-4xl text-center">
          <h1 className="m-0 text-5xl font-bold text-gray-900">Mitarbeiter-Stempeln</h1>
          <p className="mt-3 text-xl text-gray-500">Persönliches Armband an den Leser halten</p>
        </header>

        <main className="mx-auto max-w-4xl">
          {!clockState ? (
            <button
              type="button"
              aria-label="Armband scannen"
              onClick={() => void handleScan()}
              disabled={isBusy}
              className="rounded-4xl mx-auto flex min-h-80 w-full max-w-2xl flex-col items-center justify-center gap-6 border-2 border-blue-100 bg-white p-12 text-gray-900 shadow-xl disabled:cursor-wait disabled:opacity-70"
            >
              <span className="flex h-28 w-28 items-center justify-center rounded-full bg-blue-50 text-6xl">
                ◉
              </span>
              <span className="text-3xl font-bold">
                {isBusy ? 'Armband wird gelesen …' : 'Armband scannen'}
              </span>
            </button>
          ) : (
            <section
              className="rounded-4xl border border-gray-200 bg-white p-10 text-left"
              style={{ boxShadow: designSystem.shadows.card }}
            >
              <div className="flex flex-wrap items-start justify-between gap-5 border-b border-gray-100 pb-7">
                <div>
                  <p className="m-0 text-lg text-gray-500">Mitarbeitende/r</p>
                  <h2 className="mb-0 mt-1 text-4xl font-bold text-gray-900">
                    {clockState.staff_name}
                  </h2>
                </div>
                <span
                  className={`rounded-full px-6 py-3 text-xl font-bold ${
                    clockState.state === 'checked_out'
                      ? 'bg-gray-100 text-gray-700'
                      : clockState.state === 'on_break'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-green-100 text-green-800'
                  }`}
                >
                  {stateLabels[clockState.state]}
                </span>
              </div>

              {completedMessage ? (
                <div className="flex flex-col items-center gap-5 py-10 text-center">
                  <span
                    className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100 text-5xl font-bold text-green-700"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <p className="m-0 text-3xl font-bold text-gray-900">{completedMessage}</p>
                  <p className="m-0 text-lg text-gray-500">
                    Für die nächste Aktion muss das persönliche Armband erneut gescannt werden.
                  </p>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleScan()}
                    className="mt-3 min-h-20 rounded-2xl bg-blue-600 px-8 py-4 text-xl font-bold text-white disabled:opacity-60"
                  >
                    Nächstes Armband scannen
                  </button>
                </div>
              ) : (
                <>
                  {clockState.state !== 'checked_out' && (
                    <div className="my-7 grid grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-gray-50 p-5">
                        <p className="m-0 text-gray-500">Arbeitszeit heute</p>
                        <p className="mb-0 mt-1 text-2xl font-bold">
                          {formatMinutes(clockState.net_minutes)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 p-5">
                        <p className="m-0 text-gray-500">Pause heute</p>
                        <p className="mb-0 mt-1 text-2xl font-bold">
                          {formatMinutes(clockState.break_minutes)}
                        </p>
                      </div>
                    </div>
                  )}

                  {clockState.required_break_minutes > 0 && !clockState.is_break_compliant && (
                    <div className="my-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-lg text-amber-900">
                      Pausenhinweis: Nach §4 ArbZG sind heute mindestens{' '}
                      {clockState.required_break_minutes} Minuten Pause erforderlich.
                    </div>
                  )}

                  {clockState.state === 'checked_out' && (
                    <fieldset className="my-8">
                      <legend className="mb-3 text-xl font-semibold text-gray-800">
                        Arbeitsort wählen
                      </legend>
                      <div className="grid grid-cols-2 gap-4">
                        {(
                          [
                            ['present', 'Vor Ort'],
                            ['home_office', 'Homeoffice'],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selectedStatus === value}
                            onClick={() => setSelectedStatus(value)}
                            className={`rounded-2xl border-2 p-5 text-xl font-bold ${
                              selectedStatus === value
                                ? 'border-blue-500 bg-blue-50 text-blue-800'
                                : 'border-gray-200 bg-white text-gray-700'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  <div className="mt-8 grid grid-cols-2 gap-4">
                    {clockState.allowed_actions.map(action => (
                      <button
                        key={action}
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAction(action)}
                        className={`min-h-24 rounded-2xl px-6 py-5 text-2xl font-bold text-white disabled:opacity-60 ${
                          action === 'checkout'
                            ? 'bg-red-500'
                            : action === 'break_start'
                              ? 'bg-amber-500'
                              : 'bg-green-600'
                        }`}
                      >
                        {isBusy ? 'Wird gespeichert …' : actionLabels[action]}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleScan()}
                      className="min-h-24 rounded-2xl border-2 border-gray-200 bg-white px-6 py-5 text-xl font-bold text-gray-700 disabled:opacity-60"
                    >
                      Anderes Armband scannen
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </main>
      </div>

      <ErrorModal isOpen={showError} onClose={() => setShowError(false)} message={errorMessage} />

      <ModalBase
        isOpen={pendingCommand !== null}
        onClose={() => {
          setPendingCommand(null);
          setReason('');
        }}
        size="sm"
        closeOnBackdropClick={!isBusy}
      >
        <h2 className="mt-0 text-2xl font-bold text-gray-900">Begründung erforderlich</h2>
        <p className="text-lg text-gray-600">{reasonPrompt}</p>
        <label
          className="block text-left text-lg font-semibold text-gray-800"
          htmlFor="staff-clock-reason"
        >
          Begründung
        </label>
        <textarea
          id="staff-clock-reason"
          value={reason}
          onChange={event => setReason(event.target.value)}
          className="mt-2 min-h-28 w-full rounded-xl border-2 border-gray-200 p-3 text-lg"
          maxLength={500}
          autoFocus
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setPendingCommand(null)}
            className="rounded-xl border border-gray-300 px-5 py-3 text-lg font-semibold"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={isBusy || reason.trim().length === 0}
            onClick={handleReasonSubmit}
            className="rounded-xl bg-blue-600 px-5 py-3 text-lg font-semibold text-white disabled:opacity-50"
          >
            Erneut stempeln
          </button>
        </div>
      </ModalBase>
    </BackgroundWrapper>
  );
}

export default StaffClockPage;
