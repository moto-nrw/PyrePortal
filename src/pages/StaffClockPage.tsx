import { faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { adapter } from '@platform';

import { BackgroundWrapper } from '../components/background-wrapper';
import { ErrorModal, ModalBase } from '../components/ui';
import BackButton from '../components/ui/BackButton';
import { isRealScanningEnabled } from '../platform/adapter';
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
import { pressHandlers } from '../utils/pressHandlers';
import { withTimeout } from '../utils/withTimeout';

const logger = createLogger('StaffClockPage');
const SCAN_TIMEOUT_MS = 20_000;
/**
 * A scan only authorizes an immediate action. On this shared kiosk the scanned
 * credential is dropped after this much inactivity so nobody can clock a
 * colleague in or out with a card that was left behind.
 */
const SCANNED_TAG_IDLE_TIMEOUT_MS = 45_000;
const SCAN_TIMEOUT_MESSAGE =
  'Scanner reagiert nicht mehr. Bitte Scanner neu starten und erneut versuchen.';
/**
 * Every control on this page is disabled while a request is in flight, so a
 * backend that accepts the connection but never answers would trap the kiosk.
 * Bound each request instead of trusting the network stack to give up.
 */
const REQUEST_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MESSAGE = 'Server antwortet nicht. Bitte erneut versuchen.';
/**
 * Extra time granted to a clock mutation that missed its deadline. The request
 * was never aborted, so it is still the only source that can say whether the
 * action committed — reading state from a second request while it is in flight
 * would race the commit. Bounded so a backend that never answers cannot trap
 * the kiosk for longer than REQUEST_TIMEOUT_MS + this.
 */
const MUTATION_GRACE_MS = 10_000;
/**
 * How long a fresh scan waits for a still-unresolved mutation on the same card
 * before refusing. Reading state next to an outstanding write is what has to be
 * prevented; waiting forever would instead hand the kiosk to nobody.
 */
const UNRESOLVED_FENCE_MS = 20_000;
const UNRESOLVED_FENCE_MESSAGE =
  'Die vorherige Stempelung wird noch verarbeitet. Bitte kurz warten und erneut scannen.';
/** Internal marker distinguishing our own deadline from a backend error. */
const TIMEOUT_SENTINEL = '__staff_clock_request_timeout__';
/**
 * A clock action whose outcome is unknown is indeterminate, not failed: the
 * request may have committed with only the response lost. Never claim it did
 * not happen, and never leave the scanned card authorized afterwards.
 */
const INDETERMINATE_UNKNOWN_MESSAGE =
  'Die Stempelung konnte nicht bestätigt werden. Bitte Armband erneut scannen und Status prüfen.';

/** Failure that already carries a German, user-facing message. */
class LocalizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalizedError';
  }
}

/** Scanner-level failure that already carries a German, user-facing message. */
class ScannerError extends LocalizedError {
  constructor(message: string) {
    super(message);
    this.name = 'ScannerError';
  }
}

/**
 * Timeout of a request whose outcome is unknown — the call was not aborted, so
 * the server may still have applied it.
 */
class RequestTimeoutError extends LocalizedError {
  constructor() {
    super(REQUEST_TIMEOUT_MESSAGE);
    this.name = 'RequestTimeoutError';
  }
}

/** Reject a stalled backend call so the page becomes operable again. */
async function withRequestTimeout<T>(promise: Promise<T>): Promise<T> {
  try {
    return await withTimeout(promise, REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MESSAGE);
  } catch (error) {
    if (error instanceof Error && error.message === REQUEST_TIMEOUT_MESSAGE) {
      logger.error('Staff clock request timed out');
      throw new RequestTimeoutError();
    }
    throw error;
  }
}

/**
 * What a clock mutation is known to have done.
 *
 * `indeterminate` is the honest answer whenever the request left the kiosk but
 * no verdict came back — a missed deadline, a dropped connection, an
 * unparseable body, a server-side fault. In all of those the write may have
 * been applied server-side while only the answer was lost.
 */
type MutationOutcome =
  | { kind: 'success'; state: StaffClockState }
  | { kind: 'failed'; error: unknown }
  | { kind: 'indeterminate' };

/**
 * Wait up to `timeoutMs` for a clock mutation and classify how it ended.
 *
 * Safe to call repeatedly on the same promise: the call is never aborted, so
 * awaiting it again is how the kiosk learns the real outcome after its own
 * deadline expired.
 */
async function settleMutation(
  mutation: Promise<StaffClockState>,
  timeoutMs: number
): Promise<MutationOutcome> {
  try {
    return { kind: 'success', state: await withTimeout(mutation, timeoutMs, TIMEOUT_SENTINEL) };
  } catch (error) {
    if (error instanceof Error && error.message === TIMEOUT_SENTINEL) {
      return { kind: 'indeterminate' };
    }
    // A structured client error means the handler examined the command and
    // refused it, so nothing was written. Everything else — transport failure,
    // unparseable success body, 5xx — leaves the outcome unknown.
    if (error instanceof ApiError && error.statusCode < 500) {
      return { kind: 'failed', error };
    }
    logger.warn('Staff clock mutation failed with an indeterminate outcome', {
      error: serializeError(error),
    });
    return { kind: 'indeterminate' };
  }
}

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

/** Pill colors per state chip, aligned with the app's badge tints. */
const statePillStyles: Record<StaffClockState['state'], { background: string; color: string }> = {
  checked_out: { background: '#F3F4F6', color: '#374151' },
  checked_in: { background: 'rgba(131,205,45,0.15)', color: '#16A34A' },
  on_break: { background: '#FEF3C7', color: '#B45309' },
};

/** Action button appearance following the existing pill-button language. */
const actionButtonStyles: Record<StaffClockAction, { background: string; boxShadow: string }> = {
  checkin: { background: designSystem.gradients.greenRight, boxShadow: designSystem.shadows.green },
  break_start: { background: '#F59E0B', boxShadow: '0 8px 40px rgba(245,158,11,0.3)' },
  break_end: { background: designSystem.gradients.blueRight, boxShadow: designSystem.shadows.blue },
  checkout: { background: '#EF4444', boxShadow: '0 8px 40px rgba(239,68,68,0.3)' },
};

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} Std. ${rest} Min.` : `${rest} Min.`;
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

  // The adapter timeout cannot interrupt a stuck SPI call, so guard on the frontend.
  let result;
  try {
    result = await withTimeout(
      adapter.scanSingleTag(SCAN_TIMEOUT_MS),
      SCAN_TIMEOUT_MS,
      SCAN_TIMEOUT_MESSAGE
    );
  } catch (error) {
    logger.error('Staff tag scan invocation failed', { error: serializeError(error) });
    throw new ScannerError(
      error instanceof Error && error.message === SCAN_TIMEOUT_MESSAGE
        ? SCAN_TIMEOUT_MESSAGE
        : 'Verbindung zum Scanner unterbrochen. Bitte Scanner neu starten.'
    );
  }

  // Adapter errors are English hardware strings ("Scan timed out") — never show them raw.
  if (!result.success || !result.tag_id) {
    logger.warn('Staff tag scan returned no tag', { scannerError: result.error });
    throw new ScannerError('Armband konnte nicht gelesen werden. Bitte erneut versuchen.');
  }
  return result.tag_id;
}

/** Large pill CTA used across the kiosk (TagAssignment, session flows). */
function PillButton({
  label,
  onClick,
  disabled,
  background,
  boxShadow,
  minWidth,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  background: string;
  boxShadow: string;
  minWidth?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...pressHandlers(disabled)}
      style={{
        height: '68px',
        padding: '0 40px',
        minWidth,
        fontSize: '24px',
        fontWeight: 700,
        color: '#FFFFFF',
        background: disabled ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)' : background,
        border: 'none',
        borderRadius: designSystem.borderRadius.full,
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none',
        boxShadow: disabled ? 'none' : boxShadow,
        opacity: disabled ? 0.6 : 1,
        transition: designSystem.transitions.base,
      }}
    >
      {label}
    </button>
  );
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
  const [idleTick, setIdleTick] = useState(0);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  /**
   * A mutation that left the kiosk without a verdict, remembered per card. The
   * call was never aborted, so its write can still commit: until it settles, any
   * state read for that card may be answered from before the commit and would
   * re-offer an action the employee has effectively already taken — a stalled
   * checkout committing after a "Pause starten erfolgreich" would silently drop
   * the rest of the shift.
   */
  const unresolvedMutationRef = useRef<{ tag: string; settled: Promise<void> } | null>(null);

  /** Any interaction restarts the credential expiry window. */
  const registerActivity = useCallback(() => setIdleTick(tick => tick + 1), []);

  // Drop the scanned credential (and the result it revealed) after inactivity.
  useEffect(() => {
    if (isBusy || (!scannedTag && !completedMessage)) return;
    const handle = setTimeout(() => {
      logger.info('Scanned staff credential expired after inactivity');
      setScannedTag(null);
      setClockState(null);
      setCompletedMessage(null);
      setPendingCommand(null);
      setReason('');
      setSelectedStatus('present');
    }, SCANNED_TAG_IDLE_TIMEOUT_MS);
    return () => clearTimeout(handle);
  }, [scannedTag, completedMessage, isBusy, idleTick]);

  const showFailure = (error: unknown) => {
    logger.error('Staff clock operation failed', { error: serializeError(error) });
    let message = error instanceof LocalizedError ? error.message : mapApiErrorToGerman(error);
    if (error instanceof ApiError && error.code === 'planned_start_not_reached') {
      const planned = error.details?.planned_start_time;
      if (planned) message = `Einstempeln ist erst ab ${planned} Uhr möglich.`;
    }
    setErrorMessage(message);
    setShowError(true);
  };

  /**
   * Re-read the authoritative state for a still-held card. Used after the server
   * rejected an action as stale, so the page stops offering it. Only safe while
   * no mutation is outstanding — a read issued next to an in-flight write can be
   * answered from before the commit. On failure the card is dropped.
   */
  const refreshState = async (pin: string, tag: string): Promise<void> => {
    try {
      const state = await withRequestTimeout(api.getStaffClockState(pin, tag));
      setClockState(state);
      setSelectedStatus(state.session?.status ?? 'present');
    } catch (error) {
      // Without fresh state every displayed action could be stale — drop the card.
      logger.warn('Failed to reload staff clock state after conflict', {
        error: serializeError(error),
      });
      setClockState(null);
      setScannedTag(null);
    }
  };

  /**
   * The action may or may not have been applied. Discard everything derived from
   * it: the cached state is possibly stale, and the scanned card must not stay
   * authorized — on this shared kiosk a consumed credential left in place lets
   * the next person at the reader trigger a further action without scanning.
   */
  const discardAfterIndeterminate = (action: StaffClockAction) => {
    logger.warn('Staff clock action outcome unknown, dropping cached state and credential', {
      action,
    });
    setPendingCommand(null);
    setReason('');
    setCompletedMessage(null);
    setClockState(null);
    setScannedTag(null);
    setSelectedStatus('present');
    setErrorMessage(INDETERMINATE_UNKNOWN_MESSAGE);
    setShowError(true);
  };

  /**
   * Fence the card behind the mutation whose outcome stayed unknown, so nothing
   * touches that employee's state until the outstanding call has settled.
   */
  const fenceCard = (tag: string, mutation: Promise<StaffClockState>) => {
    const settled = mutation.then(
      () => undefined,
      () => undefined
    );
    const entry = { tag, settled };
    unresolvedMutationRef.current = entry;
    void settled.then(() => {
      if (unresolvedMutationRef.current === entry) unresolvedMutationRef.current = null;
    });
  };

  /** Block a read on a card whose previous mutation has not reported back yet. */
  const awaitUnresolvedMutation = async (tag: string): Promise<void> => {
    const unresolved = unresolvedMutationRef.current;
    if (unresolved?.tag !== tag) return;
    logger.warn('Holding a scan until the unresolved clock mutation settles');
    try {
      await withTimeout(unresolved.settled, UNRESOLVED_FENCE_MS, UNRESOLVED_FENCE_MESSAGE);
    } catch {
      // Refusing is the honest answer: the write is still out there, and any
      // state shown now could be overtaken by it moments later.
      throw new LocalizedError(UNRESOLVED_FENCE_MESSAGE);
    }
  };

  const runCommand = async (command: StaffClockCommand) => {
    if (!authenticatedUser?.pin || inFlightRef.current) return;
    const pin = authenticatedUser.pin;
    inFlightRef.current = true;
    setIsBusy(true);
    try {
      // Hold on to the mutation itself: our deadline does not abort it, so the
      // outstanding call stays the only thing that can report what it did.
      const mutation = api.executeStaffClockAction(pin, command);
      let outcome = await settleMutation(mutation, REQUEST_TIMEOUT_MS);
      if (outcome.kind === 'indeterminate') {
        // Give the original call a bounded second chance rather than issuing a
        // read beside it — a state GET sent now can return the pre-mutation
        // state moments before the write commits, and the page would present
        // that as authoritative.
        logger.warn('Staff clock action missed its deadline, awaiting the outstanding request', {
          action: command.action,
        });
        outcome = await settleMutation(mutation, MUTATION_GRACE_MS);
      }

      if (outcome.kind === 'success') {
        setClockState(outcome.state);
        setCompletedMessage(`${actionLabels[command.action]} erfolgreich`);
        setPendingCommand(null);
        setReason('');
        // A scan authorizes exactly one action; the next one needs a fresh scan.
        setScannedTag(null);
        logUserAction('Staff clock action completed', { action: command.action });
        return;
      }

      if (outcome.kind === 'indeterminate') {
        fenceCard(command.rfid_tag, mutation);
        discardAfterIndeterminate(command.action);
        return;
      }

      const error = outcome.error;
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
        return;
      }

      showFailure(error);
      // The state moved on (web app, other kiosk): the cached allowed_actions
      // are wrong now, so reload before offering anything else. The mutation has
      // settled at this point, so this read cannot race it.
      if (error instanceof ApiError && error.code === 'invalid_staff_clock_state') {
        setPendingCommand(null);
        await refreshState(pin, command.rfid_tag);
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
      await awaitUnresolvedMutation(tag);
      const state = await withRequestTimeout(api.getStaffClockState(authenticatedUser.pin, tag));
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
      <div
        style={{
          height: '100vh',
          width: '100vw',
          overflow: 'auto',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
          <BackButton onClick={handleBack} disabled={isBusy} />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '56px',
            fontWeight: 700,
            lineHeight: 1.2,
            marginTop: '40px',
            marginBottom: '12px',
            textAlign: 'center',
            color: '#111827',
          }}
        >
          Mitarbeiter-Stempeln
        </h1>
        <p
          style={{
            fontSize: '22px',
            color: '#6B7280',
            textAlign: 'center',
            margin: '0 0 40px 0',
          }}
        >
          Persönliches Armband an den Leser halten
        </p>

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: clockState ? 'flex-start' : 'center',
            justifyContent: 'center',
          }}
        >
          {!clockState ? (
            /* Initial state: prompt + scan CTA, mirrors TagAssignmentPage */
            <div style={{ textAlign: 'center', paddingBottom: '80px' }}>
              <div
                style={{
                  width: '140px',
                  height: '140px',
                  backgroundColor: '#E6EFFF',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 40px',
                }}
              >
                <FontAwesomeIcon
                  icon={faWifi}
                  size="5x"
                  style={{ color: '#5080D8', transform: 'rotate(90deg)' }}
                />
              </div>

              <p
                style={{
                  fontSize: '24px',
                  color: '#374151',
                  marginBottom: '40px',
                  lineHeight: 1.4,
                }}
              >
                Drücken Sie den Knopf und halten Sie
                <br />
                das persönliche Armband an das Lesegerät
              </p>

              <PillButton
                label={isBusy ? 'Armband wird gelesen …' : 'Armband scannen'}
                onClick={() => void handleScan()}
                disabled={isBusy}
                background={designSystem.gradients.blueRight}
                boxShadow={designSystem.shadows.blue}
                minWidth="360px"
              />
            </div>
          ) : (
            /* Result card: glassmorphism surface like the app's cards */
            <section
              style={{
                width: '100%',
                maxWidth: '820px',
                background: designSystem.glass.background,
                backdropFilter: designSystem.glass.blur,
                WebkitBackdropFilter: designSystem.glass.blur,
                border: '1px solid rgba(229,231,235,0.5)',
                borderRadius: '32px',
                boxShadow: designSystem.shadows.button,
                padding: '40px 48px',
                textAlign: 'left',
              }}
            >
              {/* Card header: name + state pill */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '20px',
                  borderBottom: '1px solid #F3F4F6',
                  paddingBottom: '28px',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: '18px', color: '#6B7280' }}>Mitarbeitende/r</p>
                  <h2
                    style={{
                      margin: '4px 0 0 0',
                      fontSize: '40px',
                      fontWeight: 700,
                      color: '#1F2937',
                    }}
                  >
                    {clockState.staff_name}
                  </h2>
                </div>
                <span
                  style={{
                    padding: '10px 24px',
                    borderRadius: designSystem.borderRadius.full,
                    fontSize: '20px',
                    fontWeight: 700,
                    ...statePillStyles[clockState.state],
                  }}
                >
                  {stateLabels[clockState.state]}
                </span>
              </div>

              {completedMessage ? (
                /* Success state after an executed action */
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '20px',
                    padding: '48px 0 16px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '96px',
                      height: '96px',
                      backgroundColor: 'rgba(131,205,45,0.15)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-hidden="true"
                  >
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#16A34A"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <p style={{ margin: 0, fontSize: '32px', fontWeight: 700, color: '#1F2937' }}>
                    {completedMessage}
                  </p>
                  <p style={{ margin: 0, fontSize: '20px', color: '#6B7280' }}>
                    Für die nächste Aktion muss das persönliche Armband erneut gescannt werden.
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <PillButton
                      label="Nächstes Armband scannen"
                      onClick={() => void handleScan()}
                      disabled={isBusy}
                      background={designSystem.gradients.blueRight}
                      boxShadow={designSystem.shadows.blue}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Today's totals */}
                  {clockState.state !== 'checked_out' && (
                    <div style={{ display: 'flex', gap: '16px', margin: '28px 0 0 0' }}>
                      {(
                        [
                          ['Arbeitszeit heute', clockState.net_minutes],
                          ['Pause heute', clockState.break_minutes],
                        ] as const
                      ).map(([label, minutes]) => (
                        <div
                          key={label}
                          style={{
                            flex: 1,
                            backgroundColor: '#F9FAFB',
                            border: '1px solid #E5E7EB',
                            borderRadius: '16px',
                            padding: '20px 24px',
                          }}
                        >
                          <p style={{ margin: 0, fontSize: '17px', color: '#6B7280' }}>{label}</p>
                          <p
                            style={{
                              margin: '6px 0 0 0',
                              fontSize: '30px',
                              fontWeight: 700,
                              color: '#1F2937',
                            }}
                          >
                            {formatMinutes(minutes)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ArbZG break hint */}
                  {clockState.required_break_minutes > 0 && !clockState.is_break_compliant && (
                    <div
                      style={{
                        marginTop: '20px',
                        backgroundColor: '#FEF3C7',
                        border: '1px solid #FDE68A',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        fontSize: '19px',
                        color: '#92400E',
                      }}
                    >
                      Pausenhinweis: Nach §4 ArbZG sind heute mindestens{' '}
                      {clockState.required_break_minutes} Minuten Pause erforderlich.
                    </div>
                  )}

                  {/* Work location choice before check-in */}
                  {clockState.state === 'checked_out' && (
                    <fieldset style={{ border: 'none', padding: 0, margin: '32px 0 0 0' }}>
                      <legend
                        style={{
                          fontSize: '20px',
                          fontWeight: 600,
                          color: '#374151',
                          marginBottom: '14px',
                          padding: 0,
                        }}
                      >
                        Arbeitsort wählen
                      </legend>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        {(
                          [
                            ['present', 'Vor Ort'],
                            ['home_office', 'Homeoffice'],
                          ] as const
                        ).map(([value, label]) => {
                          const selected = selectedStatus === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={selected}
                              // Locked while a check-in is in flight: the command already
                              // captured the work location, so a late change would lie.
                              disabled={isBusy}
                              onClick={() => {
                                registerActivity();
                                setSelectedStatus(value);
                              }}
                              {...pressHandlers(isBusy)}
                              style={{
                                flex: 1,
                                padding: '20px',
                                fontSize: '22px',
                                fontWeight: 700,
                                borderRadius: '16px',
                                border: selected ? '2px solid #83CD2D' : '2px solid #E5E7EB',
                                backgroundColor: selected ? 'rgba(131,205,45,0.15)' : '#FFFFFF',
                                color: selected ? '#16A34A' : '#374151',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                opacity: isBusy ? 0.6 : 1,
                                outline: 'none',
                                transition: designSystem.transitions.base,
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}

                  {/* Actions allowed by the server */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '16px',
                      marginTop: '36px',
                    }}
                  >
                    {clockState.allowed_actions.map(action => (
                      <div key={action} style={{ flex: '1 1 240px', display: 'flex' }}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAction(action)}
                          {...pressHandlers(isBusy)}
                          style={{
                            flex: 1,
                            height: '68px',
                            fontSize: '24px',
                            fontWeight: 700,
                            color: '#FFFFFF',
                            background: isBusy
                              ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                              : actionButtonStyles[action].background,
                            border: 'none',
                            borderRadius: designSystem.borderRadius.full,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            outline: 'none',
                            boxShadow: isBusy ? 'none' : actionButtonStyles[action].boxShadow,
                            opacity: isBusy ? 0.6 : 1,
                            transition: designSystem.transitions.base,
                          }}
                        >
                          {isBusy ? 'Wird gespeichert …' : actionLabels[action]}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex' }}>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleScan()}
                      {...pressHandlers(isBusy)}
                      style={{
                        flex: 1,
                        height: '64px',
                        fontSize: '22px',
                        fontWeight: 600,
                        color: '#374151',
                        backgroundColor: '#FFFFFF',
                        border: '2px solid #E5E7EB',
                        borderRadius: designSystem.borderRadius.full,
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        outline: 'none',
                        opacity: isBusy ? 0.6 : 1,
                        transition: designSystem.transitions.base,
                      }}
                    >
                      Anderes Armband scannen
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>

      <ErrorModal isOpen={showError} onClose={() => setShowError(false)} message={errorMessage} />

      {/* Reason dialog for deviation / reopen conflicts */}
      <ModalBase
        isOpen={pendingCommand !== null}
        onClose={() => {
          setPendingCommand(null);
          setReason('');
        }}
        size="sm"
        closeOnBackdropClick={!isBusy}
      >
        <h2
          style={{
            margin: '0 0 12px 0',
            fontSize: '32px',
            fontWeight: 700,
            color: '#111827',
            textAlign: 'center',
          }}
        >
          Begründung erforderlich
        </h2>
        <p
          style={{
            margin: '0 0 24px 0',
            fontSize: '20px',
            color: '#4B5563',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          {reasonPrompt}
        </p>
        <label
          htmlFor="staff-clock-reason"
          style={{
            display: 'block',
            textAlign: 'left',
            fontSize: '18px',
            fontWeight: 600,
            color: '#374151',
            marginBottom: '8px',
          }}
        >
          Begründung
        </label>
        <textarea
          id="staff-clock-reason"
          value={reason}
          onChange={event => {
            registerActivity();
            setReason(event.target.value);
          }}
          maxLength={500}
          autoFocus
          style={{
            width: '100%',
            minHeight: '120px',
            border: '2px solid #E5E7EB',
            borderRadius: '16px',
            padding: '16px',
            fontSize: '19px',
            fontFamily: 'inherit',
            color: '#1F2937',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            marginTop: '28px',
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setPendingCommand(null);
              setReason('');
            }}
            {...pressHandlers(isBusy)}
            style={{
              height: '60px',
              padding: '0 32px',
              whiteSpace: 'nowrap',
              fontSize: '20px',
              fontWeight: 600,
              color: '#374151',
              backgroundColor: '#FFFFFF',
              border: '2px solid #E5E7EB',
              borderRadius: designSystem.borderRadius.full,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              outline: 'none',
              transition: designSystem.transitions.base,
            }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={isBusy || reason.trim().length === 0}
            onClick={handleReasonSubmit}
            {...pressHandlers(isBusy || reason.trim().length === 0)}
            style={{
              height: '60px',
              padding: '0 40px',
              whiteSpace: 'nowrap',
              fontSize: '20px',
              fontWeight: 700,
              color: '#FFFFFF',
              background:
                isBusy || reason.trim().length === 0
                  ? 'linear-gradient(to right, #9CA3AF, #9CA3AF)'
                  : designSystem.gradients.blueRight,
              border: 'none',
              borderRadius: designSystem.borderRadius.full,
              cursor: isBusy || reason.trim().length === 0 ? 'not-allowed' : 'pointer',
              outline: 'none',
              boxShadow: isBusy || reason.trim().length === 0 ? 'none' : designSystem.shadows.blue,
              opacity: isBusy || reason.trim().length === 0 ? 0.6 : 1,
              transition: designSystem.transitions.base,
            }}
          >
            Erneut stempeln
          </button>
        </div>
      </ModalBase>
    </BackgroundWrapper>
  );
}

export default StaffClockPage;
