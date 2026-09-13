import { createHash } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

/** No live backend or credentials: exercise the real scan hook with HTTP fixtures. */
async function captureCheckout(page: Page, action: 'checked_out' | 'checked_out_daily') {
  const session = {
    active_group_id: 100,
    activity_id: 1,
    activity_name: 'Nachmittagsbetreuung',
    room_id: 1,
    room_name: 'Raum 101',
    device_id: 1,
    start_time: '2026-09-13T10:00:00Z',
    duration: '1h',
    is_active: true,
    active_students: 5,
  };
  await page.addInitScript(() => {
    Object.assign(window, { __PYREPORTAL_DISABLE_AUTOSCAN__: true });
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      let data: unknown = {};
      if (url.pathname.includes('/session/current')) data = session;
      if (url.pathname.includes('/rooms/available')) {
        data = [
          { id: 1, name: 'Raum 101' },
          { id: 2, name: 'Schulhof' },
          { id: 3, name: 'WC' },
        ];
      }
      if (url.pathname.endsWith('/config')) {
        data = {
          presence_mode: 'detailed',
          checkout: {
            raumwechsel_enabled: true,
            schulhof_enabled: true,
            wc_enabled: true,
            daily_checkout_time: null,
          },
          feedback: { enabled: true },
        };
      }
      if (url.pathname.endsWith('/checkin')) {
        data = {
          student_id: 42,
          student_name: 'Max Mustermann',
          action,
          room_name: 'Raum 101',
          daily_checkout_available: true,
          feedback_enabled: true,
          active_students: 5,
          visit_id: 101,
        };
      }
      if (url.pathname.includes('/attendance/toggle')) data = { feedback_enabled: true };
      await route.fulfill({ json: { status: 'success', data, message: 'ok' } });
      return;
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  await page.evaluate(async currentSession => {
    // Vite serves this dev-only import; avoid importing a second store into the test process.
    const storeModule = '/src/store/userStore.ts';
    const { useUserStore } = await import(/* @vite-ignore */ storeModule);
    useUserStore.setState({
      authenticatedUser: { id: 1, name: 'Test', pin: '1234' },
      selectedRoom: { id: 1, name: 'Raum 101' },
      selectedActivity: {
        id: 1,
        name: 'Nachmittagsbetreuung',
        category: 'Test',
        max_participants: 30,
        enrollment_count: 5,
      },
      selectedSupervisors: [{ id: 1, name: 'Test' }],
      currentSession,
    });
    history.pushState({}, '', '/nfc-scanning');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, session);
  await page.waitForFunction(() => '__PYREPORTAL_MOCK_SCAN__' in window);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.install({ time: new Date('2026-09-13T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-13T12:00:01Z'));
  await page.evaluate(() => {
    const inject = Reflect.get(window, '__PYREPORTAL_MOCK_SCAN__');
    inject('test-tag');
  });
  await expect(page.getByText('Wohin geht Max?')).toBeVisible();
  const checkout = await page.screenshot({ animations: 'disabled' });
  await page.getByRole('button', { name: 'nach Hause', exact: true }).click();
  await expect(page.getByText('Wie war dein Tag, Max?')).toBeVisible();
  const feedback = await page.screenshot({ animations: 'disabled' });
  await page.getByRole('button', { name: 'Gut', exact: true }).click();
  await expect(page.getByText('Tschüss, Max!')).toBeVisible();
  const farewell = await page.screenshot({ animations: 'disabled' });
  return { checkout, feedback, farewell };
}

test('both server checkout actions have identical destination, feedback and farewell screens', async ({
  browser,
}) => {
  const screenshots: Awaited<ReturnType<typeof captureCheckout>>[] = [];
  for (const action of ['checked_out', 'checked_out_daily'] as const) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      baseURL: 'http://localhost:1420',
    });
    try {
      const captured = await captureCheckout(page, action);
      screenshots.push(captured);
      for (const [name, body] of Object.entries(captured)) {
        await test.info().attach(`${action}-${name}`, { body, contentType: 'image/png' });
      }
    } finally {
      await page.close();
    }
  }
  for (const name of ['checkout', 'feedback', 'farewell'] as const) {
    const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
    expect(hash(screenshots[1][name]), name).toBe(hash(screenshots[0][name]));
  }
});
