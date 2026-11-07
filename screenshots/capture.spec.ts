import fs from 'node:fs';

import { test, type Page } from '@playwright/test';

import { DEVICES, type DeviceId } from './devices';
import { CAPTURED_FILE, type CapturedShots, type ShotId } from './shots';
import { SCREENSHOT_TAG, UNKNOWN_TAG } from './tags';

/**
 * Automated screenshot + video capture for PyrePortal.
 *
 * Runs once per device project (playwright.config.ts): `gkt` (GKT-Kiosk,
 * 1280x800, 16:10) and `ipad` (Wedge on an iPad Pro 11" in landscape), each
 * with deviceScaleFactor 2. The `product` project then frames the raw images.
 * Product: NFC-basiertes Check-In Terminal für die digitale Ganztagsbetreuung.
 *
 * Captures the full user journey by driving the UI with real clicks.
 * All RFID scans are DETERMINISTIC:
 *   - VITE_MOCK_RFID_TAGS is pinned to SCREENSHOT_TAG (playwright.config.ts),
 *     so the tag-assignment mock always scans that tag.
 *   - On the scanning page, scans are injected via the dev-only
 *     window.__PYREPORTAL_MOCK_SCAN__ hook; the random auto-scan interval
 *     is disabled via window.__PYREPORTAL_DISABLE_AUTOSCAN__.
 *
 * Raw images land in screenshots/output/raw/<device>/<shot id>.png together
 * with captured.json (the route of each shot) and user-journey.webm.
 *
 * Prerequisites: local backend with seeded demo data (see screenshots/README.md).
 *
 * Usage:
 *   pnpm run screenshots                         # both devices, then framing
 *   pnpm run screenshots --project=gkt           # raw images of one device
 *   SCREENSHOT_PIN=9999 pnpm run screenshots     # use a different PIN
 */

const RAW_DIR = './screenshots/output/raw';

// Must be a valid PIN on whichever backend VITE_API_BASE_URL points at.
const STAFF_PIN = process.env.SCREENSHOT_PIN ?? '1234';

let outputDir = RAW_DIR;
const captured: Record<string, CapturedShots[string]> = {};

// --- Helpers ---

/**
 * Capture a screenshot after a short settle delay (animations/fades).
 * Use a small settleMs for short-lived modals (check-in: 1.5s, farewell: 1.5s).
 * `aufsicht-konflikt` only appears on a 409 and is not part of the shot list.
 */
async function screenshot(page: Page, id: ShotId | 'aufsicht-konflikt', settleMs = 500) {
  await page.waitForTimeout(settleMs);
  await page.screenshot({
    path: `${outputDir}/${id}.png`,
    fullPage: false,
  });
  captured[id] = { pfad: new URL(page.url()).pathname };
}

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.locator('button', { hasText: new RegExp(`^${digit}$`) }).click();
    await page.waitForTimeout(100);
  }
}

/** Click the Nth grid card (SelectableCard buttons inside a 5-col grid). */
async function clickCard(page: Page, index = 0) {
  // SelectableCard renders as <button> with explicit width/height styles
  // inside a CSS grid container. Target by the grid parent.
  const gridContainer = page.locator('div[style*="grid-template-columns"]');
  const cards = gridContainer.locator('button:not([disabled])');
  const count = await cards.count();
  if (count > index) {
    await cards.nth(index).click();
  } else if (count > 0) {
    await cards.first().click();
  }
  await page.waitForTimeout(300);
}

/** Trigger a deterministic RFID scan on the scanning page (dev-only hook). */
async function injectScan(page: Page, tagId: string) {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as Record<string, unknown>).__PYREPORTAL_MOCK_SCAN__ === 'function',
    undefined,
    { timeout: 10_000 }
  );
  await page.evaluate(tag => {
    (
      window as unknown as { __PYREPORTAL_MOCK_SCAN__: (tagId: string) => void }
    ).__PYREPORTAL_MOCK_SCAN__(tag);
  }, tagId);
}

/** Wait until no modal dialog is open (short-lived modals auto-close). */
async function waitForModalClosed(page: Page, timeout = 10_000) {
  await page.waitForSelector('dialog[open]', { state: 'hidden', timeout });
}

/** Store accessor type for the dev-only __PYREPORTAL_STORE__ hook. */
interface StoreWindow {
  __PYREPORTAL_STORE__: {
    getState: () => {
      rfid: { currentScan: { action?: string; scannedTagId?: string } | null; showModal: boolean };
      setScanResult: (result: null) => void;
      hideScanModal: () => void;
    };
  };
}

/** Inject a scan and return the resulting action reported by the server. */
async function scanAndGetAction(page: Page, tagId: string): Promise<string> {
  await page.evaluate(() => {
    (window as unknown as StoreWindow).__PYREPORTAL_STORE__.getState().setScanResult(null);
  });
  await injectScan(page, tagId);
  await page.waitForFunction(
    () => {
      const state = (window as unknown as StoreWindow).__PYREPORTAL_STORE__.getState();
      return state.rfid.currentScan !== null && state.rfid.showModal;
    },
    undefined,
    { timeout: 15_000 }
  );
  return page.evaluate(() => {
    const state = (window as unknown as StoreWindow).__PYREPORTAL_STORE__.getState();
    return state.rfid.currentScan?.action ?? 'unknown';
  });
}

/** Close the scan modal via the store (bypasses auto-close timers). */
async function dismissScanModal(page: Page) {
  await page.evaluate(() => {
    (window as unknown as StoreWindow).__PYREPORTAL_STORE__.getState().hideScanModal();
  });
  await waitForModalClosed(page, 5_000);
  await page.waitForTimeout(300);
}

/**
 * Normalize attendance parity: re-runs leave the student checked in from a
 * previous session, which would flip check-in/checkout order. After this,
 * the student is guaranteed to be checked out.
 */
async function ensureCheckedOut(page: Page, tagId: string) {
  const first = await scanAndGetAction(page, tagId);
  await dismissScanModal(page);
  if (first === 'checked_in') {
    const second = await scanAndGetAction(page, tagId);
    await dismissScanModal(page);
    if (second !== 'checked_out') {
      throw new Error(`Attendance reset failed: expected checked_out, got ${second}`);
    }
  } else if (first !== 'checked_out') {
    throw new Error(`Attendance reset failed: unexpected action ${first}`);
  }
}

// ============================================================
// FULL USER JOURNEY
//
// Flow:
//   Landing → PIN → Home
//   → Armband identifizieren → Scan → Erkannt → Person auswählen
//   → Armband zuweisen → Erfolgreich → Zurück
//   → Home → Team anpassen → auswählen → Team speichern → Modal
//   → Home → Aufsicht starten → Aktivität → Betreuer → Raum → Starten
//   → NFC Scanning → Check-in → Checkout (Wohin?) → Feedback → Tschüss
//   → Abholzeit abfragen → Fehler-Modal (unbekanntes Armband)
//   → Anmelden → PIN → Home (aktive Aufsicht) → Aufsicht beenden
//   → Letzte Aufsichten → Verlaufsseite → Neue-Aufsicht-Modal
//   → Verlauf-löschen-Modal
// ============================================================

test.describe('PyrePortal User Journey', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    const device = DEVICES[testInfo.project.name as DeviceId];
    if (!device) throw new Error(`Unknown screenshot device project "${testInfo.project.name}"`);
    outputDir = `${RAW_DIR}/${device.id}`;
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
    page = await browser.newPage({
      viewport: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      hasTouch: device.hasTouch,
      // The kiosks run in Berlin; CI runners run in UTC.
      timezoneId: 'Europe/Berlin',
      locale: 'de-DE',
      recordVideo: { dir: outputDir, size: device.viewport },
    });
    // Disable the random mock-scan interval; scans are injected explicitly.
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__PYREPORTAL_DISABLE_AUTOSCAN__ = true;
    });
  });

  test.afterAll(async () => {
    const video = page.video();
    await page.close();
    if (video) {
      const recordedPath = await video.path();
      fs.renameSync(recordedPath, `${outputDir}/user-journey.webm`);
    }
    fs.writeFileSync(`${outputDir}/${CAPTURED_FILE}`, `${JSON.stringify(captured, null, 2)}\n`);
  });

  // ----------------------------------------------------------
  // 1. Landing → PIN → Home
  // ----------------------------------------------------------

  test('01 — Landing Page', async () => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'start');
  });

  test('02 — PIN Entry', async () => {
    await page.click('button:has-text("Anmelden")');
    await page.waitForURL('**/pin');
    await screenshot(page, 'pin-eingabe');
  });

  test('03 — Home (after PIN)', async () => {
    await enterPin(page, STAFF_PIN);
    await page.waitForURL('**/home', { timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'startseite');
  });

  // ----------------------------------------------------------
  // 2. Tag Assignment flow
  // ----------------------------------------------------------

  test('04 — Tag Assignment (initial)', async () => {
    await page.click('button:has-text("Armband identifizieren")');
    await page.waitForURL('**/tag-assignment');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'armband-identifizieren');
  });

  test('05 — Scanning modal', async () => {
    await page.click('button:has-text("Scan starten")');
    await page.waitForSelector('text=Armband wird erkannt', { timeout: 5_000 });
    await screenshot(page, 'armband-scan-laeuft', 300);
  });

  test('06 — Tag recognized (Armband erkannt)', async () => {
    await page.waitForSelector('text=Armband erkannt', { timeout: 15_000 });
    await screenshot(page, 'armband-erkannt', 300);
  });

  test('07 — Student Selection (unfiltered)', async () => {
    const reassignBtn = page.locator('button:has-text("Anderer Person zuweisen")');
    const selectBtn = page.locator('button:has-text("Person auswählen")');
    if ((await reassignBtn.count()) > 0) {
      await reassignBtn.click();
    } else {
      await selectBtn.click();
    }
    await page.waitForURL('**/student-selection');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'kind-auswaehlen');
  });

  test('08 — Filter by grade', async () => {
    // Click a grade filter chip (e.g. "2") to show only students
    const grade2 = page.locator('button', { hasText: /^2$/ });
    const grade1 = page.locator('button', { hasText: /^1$/ });
    if ((await grade2.count()) > 0) {
      await grade2.click();
    } else if ((await grade1.count()) > 0) {
      await grade1.click();
    }
    await page.waitForTimeout(500);
    await screenshot(page, 'kind-nach-klasse-filtern');
  });

  test('09 — Filter by OGS group + select a student', async () => {
    // Reset the grade filter, then pick a student via the OGS group picker.
    // Group members have an education group, which the "nach Hause" daily
    // checkout flow (steps 24-26) requires.
    await page.click('button:has-text("Alle")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Alle Gruppen")');
    await page.waitForSelector('text=OGS-Gruppe wählen', { timeout: 5_000 });
    await screenshot(page, 'ogs-gruppe-waehlen', 300);
    await page.click('dialog[open] button:has-text("Sternengruppe")');
    await page.waitForTimeout(500);
    await clickCard(page, 0);
    await screenshot(page, 'kind-ausgewaehlt');
  });

  test('10 — Assign tag (Armband zuweisen)', async () => {
    await page.locator('button', { hasText: 'Armband zuweisen' }).click();
    await page.waitForURL('**/tag-assignment', { timeout: 10_000 });
    await page.waitForSelector('text=Erfolgreich', { timeout: 10_000 });
    await screenshot(page, 'armband-zugewiesen', 300);
  });

  // ----------------------------------------------------------
  // 3. Back → Home → Team Management
  // ----------------------------------------------------------

  test('11 — Back to Home', async () => {
    await page.click('button:has-text("Zurück")');
    await page.waitForURL('**/home');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'startseite-zurueck');
  });

  test('12 — Team Management', async () => {
    await page.click('button:has-text("Team anpassen")');
    await page.waitForURL('**/team-management');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'team-anpassen');
  });

  test('13 — Select team members', async () => {
    // Select the first two available staff cards (names vary per backend)
    await clickCard(page, 0);
    await clickCard(page, 1);
    await screenshot(page, 'team-ausgewaehlt');
  });

  test('14 — Save team', async () => {
    await page.click('button:has-text("Team speichern")');
    await page.waitForSelector('text=Team erfolgreich', { timeout: 10_000 });
    await screenshot(page, 'team-gespeichert', 300);
  });

  // ----------------------------------------------------------
  // 4. Aufsicht starten → Activity → Staff → Room → Scanning
  // ----------------------------------------------------------

  test('15 — Home → Aufsicht starten', async () => {
    // Wait for success modal to auto-navigate back to home
    await page.waitForURL('**/home', { timeout: 5_000 });
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');

    // Clear any active session so the full activity→staff→room flow is shown
    await page.evaluate(() => {
      const store = (window as any).__PYREPORTAL_STORE__;
      if (store?.setState) {
        store.setState({
          currentSession: null,
          selectedActivity: null,
          selectedRoom: null,
          selectedSupervisors: [],
        });
      }
    });
    await page.waitForTimeout(500);

    await page.click('button:has-text("Aufsicht starten")');
    await page.waitForTimeout(500);
  });

  test('16 — Activity Selection', async () => {
    await page.waitForURL('**/activity-selection', { timeout: 5_000 });
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'aktivitaet-waehlen');
  });

  test('17 — Select activity', async () => {
    await clickCard(page, 0);
    await screenshot(page, 'aktivitaet-ausgewaehlt');
  });

  test('18 — Staff Selection', async () => {
    await page.click('button:has-text("Weiter")');
    await page.waitForURL('**/staff-selection');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'betreuer-waehlen');
  });

  test('19 — Select staff', async () => {
    await clickCard(page, 0);
    await screenshot(page, 'betreuer-ausgewaehlt');
  });

  test('20 — Room Selection', async () => {
    await page.click('button:has-text("Weiter")');
    await page.waitForURL('**/rooms');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'raum-waehlen');
  });

  test('21 — Select room → Confirmation', async () => {
    await clickCard(page, 0);
    await page.waitForSelector('text=Aufsicht starten?', { timeout: 5_000 });
    await screenshot(page, 'aufsicht-starten-bestaetigen', 300);
  });

  test('22 — Start session → NFC Scanning', async () => {
    test.setTimeout(30_000);
    const dialogStartBtn = page.locator('dialog[open] button:has-text("Aufsicht starten")');
    await dialogStartBtn.click();
    await page.waitForTimeout(1000);

    // Handle 409 conflict: if "Trotzdem starten" appears, click it
    const forceBtn = page.locator('button:has-text("Trotzdem starten")');
    if ((await forceBtn.count()) > 0) {
      await screenshot(page, 'aufsicht-konflikt', 300);
      await forceBtn.click();
    }

    await page.waitForURL('**/nfc-scanning', { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'nfc-scan-bereit');
  });

  // ----------------------------------------------------------
  // 5. Deterministic scans → Check-in / Checkout / Feedback
  //    SCREENSHOT_TAG was assigned to a student in step 10.
  // ----------------------------------------------------------

  test('23 — Check-in modal', async () => {
    test.setTimeout(60_000);
    // Re-runs may leave the student checked in — normalize to checked-out
    await ensureCheckedOut(page, SCREENSHOT_TAG);
    await injectScan(page, SCREENSHOT_TAG);
    // Check-in modal body: "Du bist jetzt in <Raum>" — auto-closes after
    // 1.5s, capture fast (the title is a backend-provided greeting)
    await page.waitForSelector('text=Du bist jetzt in', { timeout: 15_000 });
    await screenshot(page, 'einchecken', 200);
  });

  test('24 — Checkout: destination question', async () => {
    test.setTimeout(30_000);
    await waitForModalClosed(page);
    await injectScan(page, SCREENSHOT_TAG);
    // Second scan of a checked-in student → "Wohin geht <Name>?" (stays 7s)
    await page.waitForSelector('text=Wohin geht', { timeout: 15_000 });
    await screenshot(page, 'auschecken-wohin', 300);
  });

  test('25 — Checkout: feedback prompt', async () => {
    await page.click('dialog[open] button:has-text("nach Hause")');
    await page.waitForSelector('text=Wie war dein Tag', { timeout: 10_000 });
    await screenshot(page, 'tages-feedback', 300);
  });

  test('26 — Checkout: farewell', async () => {
    await page.click('dialog[open] button:has-text("Gut")');
    // Farewell modal: "Tschüss, <Name>!" — auto-closes after 1.5s, capture fast
    await page.waitForSelector('text=Tschüss,', { timeout: 10_000 });
    await screenshot(page, 'verabschiedung', 150);
  });

  // ----------------------------------------------------------
  // 6. Pickup query + error state
  // ----------------------------------------------------------

  test('27 — Pickup query prompt', async () => {
    test.setTimeout(30_000);
    await waitForModalClosed(page);
    await page.click('button[aria-label="Abholzeit abfragen"]');
    await page.waitForSelector('text=Bitte halte dein Armband an das Lesegerät', {
      timeout: 10_000,
    });
    await screenshot(page, 'abholzeit-abfragen', 300);
  });

  test('28 — Pickup query result', async () => {
    test.setTimeout(30_000);
    await injectScan(page, SCREENSHOT_TAG);
    // Shows either the pickup time or "keine Abholzeit hinterlegt" (both valid)
    await page.waitForSelector('text=/Abholzeit für|keine Abholzeit/', { timeout: 15_000 });
    await screenshot(page, 'abholzeit-ergebnis', 300);
  });

  test('29 — Error modal (unknown tag)', async () => {
    test.setTimeout(30_000);
    await waitForModalClosed(page);
    await injectScan(page, UNKNOWN_TAG);
    // Deliberate error-state capture: unassigned wristband → red modal
    await page.waitForSelector('text=Scan fehlgeschlagen', { timeout: 15_000 });
    await screenshot(page, 'scan-fehler', 200);
  });

  // ----------------------------------------------------------
  // 7. Back to Home → end session
  // ----------------------------------------------------------

  test('30 — Home with active session', async () => {
    test.setTimeout(30_000);
    await waitForModalClosed(page);
    await page.click('button[aria-label="Anmelden - zur PIN-Eingabe"]');
    await page.waitForURL('**/pin');
    await enterPin(page, STAFF_PIN);
    await page.waitForURL('**/home', { timeout: 10_000 });
    await page.waitForSelector('button:has-text("Aufsicht beenden")', { timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'startseite-aktive-aufsicht');
  });

  test('31 — End session confirmation', async () => {
    await page.click('button:has-text("Aufsicht beenden")');
    await page.waitForSelector('text=Aufsicht beenden?', { timeout: 5_000 });
    await screenshot(page, 'aufsicht-beenden', 300);
    // Confirm so the demo session doesn't linger on the backend
    await page.click('button:has-text("Ja, beenden")');
    await page.waitForTimeout(1000);
  });

  // ----------------------------------------------------------
  // 8. Session history (Letzte Aufsichten)
  //    The session started in step 22 left a history entry,
  //    so the shortcut pill is visible after the session ended.
  // ----------------------------------------------------------

  test('32 — Home with history shortcut → history page', async () => {
    test.setTimeout(30_000);
    await waitForModalClosed(page);
    await page.waitForSelector('button:has-text("Letzte Aufsichten")', { timeout: 10_000 });
    await screenshot(page, 'startseite-letzte-aufsichten', 300);

    await page.click('button:has-text("Letzte Aufsichten")');
    await page.waitForURL('**/session-history');
    await page.waitForSelector('text=Antippen startet die Aufsicht neu.');
    await screenshot(page, 'aufsichtsverlauf', 300);
  });

  test('33 — Recreate confirmation (Neue Aufsicht starten?)', async () => {
    test.setTimeout(30_000);
    // First history row (rows carry the "Zuletzt:" timestamp label)
    await page.locator('button', { hasText: 'Zuletzt:' }).first().click();
    await page.waitForSelector('text=Neue Aufsicht starten?', { timeout: 15_000 });
    await screenshot(page, 'aufsicht-neu-starten', 300);
    // Cancel — the journey must not start another session here
    await page.click('dialog[open] button:has-text("Abbrechen")');
  });

  test('34 — Clear-history confirmation', async () => {
    await waitForModalClosed(page);
    await page.click('button:has-text("Alle löschen")');
    await page.waitForSelector('text=Verlauf löschen?', { timeout: 5_000 });
    await screenshot(page, 'verlauf-loeschen', 300);
    await page.click('dialog[open] button:has-text("Abbrechen")');
  });
});
