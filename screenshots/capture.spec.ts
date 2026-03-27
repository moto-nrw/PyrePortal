import { test, type Page } from '@playwright/test';

/**
 * Automated screenshot capture for PyrePortal (GKT tablet version).
 *
 * Viewport: 1280x800 — GKT-Kiosk 10.1" TFT-LCD (16:10)
 * Product: NFC-basiertes Check-In Terminal für die digitale Ganztagsbetreuung.
 *
 * Captures the full user journey by driving the UI with real clicks.
 * Mock RFID scanning fires automatically in browser dev mode.
 *
 * Usage:
 *   npm run screenshots                    # capture all screens
 *   npm run screenshots -- --grep "03"     # capture one specific step
 *   SCREENSHOT_PIN=9999 npm run screenshots # use a different PIN
 *
 * To add a new screenshot:
 *   Add a step in the serial flow below.
 */

const OUTPUT_DIR = './screenshots/output';

// Must be a valid PIN on whichever backend VITE_API_BASE_URL points at.
const STAFF_PIN = process.env.SCREENSHOT_PIN ?? '1234';

// --- Helpers ---

async function screenshot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${OUTPUT_DIR}/${name}.png`,
    fullPage: false,
  });
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

// ============================================================
// FULL USER JOURNEY
//
// Flow:
//   Landing → PIN → Home
//   → Armband identifizieren → Scan → Erkannt → Anderem Kind zuweisen
//   → Person auswählen → Armband zuweisen → Erfolgreich → Zurück
//   → Home → Team anpassen → auswählen → Team speichern → Modal
//   → Home → Aufsicht starten → Aktivität → Betreuer → Raum → Starten
//   → NFC Scanning → Check-in modal → Check-out modal
// ============================================================

test.describe('PyrePortal User Journey', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ----------------------------------------------------------
  // 1. Landing → PIN → Home
  // ----------------------------------------------------------

  test('01 — Landing Page', async () => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-landing');
  });

  test('02 — PIN Entry', async () => {
    await page.click('button:has-text("Anmelden")');
    await page.waitForURL('**/pin');
    await screenshot(page, '02-pin-entry');
  });

  test('03 — Home (after PIN)', async () => {
    await enterPin(page, STAFF_PIN);
    await page.waitForURL('**/home', { timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    await screenshot(page, '03-home');
  });

  // ----------------------------------------------------------
  // 2. Tag Assignment flow
  // ----------------------------------------------------------

  test('04 — Tag Assignment (initial)', async () => {
    await page.click('button:has-text("Armband identifizieren")');
    await page.waitForURL('**/tag-assignment');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '04-tag-assignment');
  });

  test('05 — Scanning modal', async () => {
    await page.click('button:has-text("Scan starten")');
    await page.waitForTimeout(300);
    await screenshot(page, '05-scanning-modal');
  });

  test('06 — Tag recognized (Armband erkannt)', async () => {
    await page.waitForSelector('text=Armband erkannt', { timeout: 15_000 });
    await page.waitForTimeout(300);
    await screenshot(page, '06-tag-recognized');
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
    await screenshot(page, '07-student-selection');
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
    await screenshot(page, '08-student-filtered');
  });

  test('09 — Select a student', async () => {
    await clickCard(page, 0);
    await screenshot(page, '09-student-selected');
  });

  test('10 — Assign tag (Armband zuweisen)', async () => {
    await page.locator('button', { hasText: 'Armband zuweisen' }).click();
    await page.waitForURL('**/tag-assignment', { timeout: 10_000 });
    await page.waitForSelector('text=Erfolgreich', { timeout: 10_000 });
    await page.waitForTimeout(300);
    await screenshot(page, '10-assignment-success');
  });

  // ----------------------------------------------------------
  // 3. Back → Home → Team Management
  // ----------------------------------------------------------

  test('11 — Back to Home', async () => {
    await page.click('button:has-text("Zurück")');
    await page.waitForURL('**/home');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '11-home-return');
  });

  test('12 — Team Management', async () => {
    await page.click('button:has-text("Team anpassen")');
    await page.waitForURL('**/team-management');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '12-team-management');
  });

  test('13 — Select team members', async () => {
    // Click specific staff members by name
    const firstStaff = page.locator('button', { hasText: 'Charlotte Rölau' });
    const secondStaff = page.locator('button', { hasText: 'Christian Kamon' });
    if ((await firstStaff.count()) > 0) await firstStaff.click();
    await page.waitForTimeout(200);
    if ((await secondStaff.count()) > 0) await secondStaff.click();
    await page.waitForTimeout(200);

    // Fallback: if those names don't exist, click first two available cards
    const saveBtn = page.locator('button:has-text("Team speichern")');
    if (await saveBtn.isDisabled()) {
      await clickCard(page, 0);
      await clickCard(page, 1);
    }
    await screenshot(page, '13-team-selected');
  });

  test('14 — Save team', async () => {
    await page.click('button:has-text("Team speichern")');
    await page.waitForSelector('text=Team erfolgreich', { timeout: 10_000 });
    await screenshot(page, '14-team-saved');
  });

  // ----------------------------------------------------------
  // 4. Aufsicht starten → Activity → Staff → Room → Scanning
  //    Note: At this point a session may already be active
  //    (backend auto-detects on login). If so, the activity card
  //    on Home shows "Fortsetzen" and goes straight to NFC scanning.
  //    We handle both paths.
  // ----------------------------------------------------------

  test('15 — Home → Aufsicht starten', async () => {
    // Wait for success modal to auto-navigate back to home
    await page.waitForURL('**/home', { timeout: 5_000 });
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');

    // Clear any active session so the full activity→staff→room flow is shown
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    await screenshot(page, '16-activity-selection');
  });

  test('17 — Select activity', async () => {
    await clickCard(page, 0);
    await screenshot(page, '17-activity-selected');
  });

  test('18 — Staff Selection', async () => {
    await page.click('button:has-text("Weiter")');
    await page.waitForURL('**/staff-selection');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '18-staff-selection');
  });

  test('19 — Select staff', async () => {
    await clickCard(page, 0);
    await screenshot(page, '19-staff-selected');
  });

  test('20 — Room Selection', async () => {
    await page.click('button:has-text("Weiter")');
    await page.waitForURL('**/rooms');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '20-room-selection');
  });

  test('21 — Select room → Confirmation', async () => {
    await clickCard(page, 0);
    await page.waitForSelector('text=Aufsicht starten?', { timeout: 5_000 });
    await page.waitForTimeout(300);
    await screenshot(page, '21-confirm-session');
  });

  test('22 — Start session → NFC Scanning', async () => {
    test.setTimeout(30_000);
    const dialogStartBtn = page.locator('dialog[open] button:has-text("Aufsicht starten")');
    await dialogStartBtn.click();
    await page.waitForTimeout(1000);

    // Handle 409 conflict: if "Trotzdem starten" appears, click it
    const forceBtn = page.locator('button:has-text("Trotzdem starten")');
    if ((await forceBtn.count()) > 0) {
      await screenshot(page, '22a-session-conflict');
      await forceBtn.click();
    }

    await page.waitForURL('**/nfc-scanning', { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await screenshot(page, '22-nfc-scanning');
  });

  // ----------------------------------------------------------
  // 5. Wait for mock scans → Check-in / Check-out modals
  // ----------------------------------------------------------

  test('23 — Check-in modal (mock scan)', async () => {
    test.setTimeout(60_000);
    await page.waitForSelector('dialog[open]', { timeout: 30_000 });
    await page.waitForTimeout(600);
    await screenshot(page, '23-checkin-modal');
  });

  test('24 — Second scan modal', async () => {
    test.setTimeout(60_000);
    await page.waitForSelector('dialog[open]', { state: 'hidden', timeout: 15_000 });
    await page.waitForSelector('dialog[open]', { timeout: 45_000 });
    await page.waitForTimeout(600);
    await screenshot(page, '24-scan-modal-2');
  });
});
