import { adapter } from '@platform';
import { init, makeFetchTransport, type Breadcrumb, type ErrorEvent } from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildErrorReportingOptions,
  initErrorReporting,
  removeDeviceKey,
  type ErrorReportingConfig,
} from './errorReporting';

vi.mock('@sentry/react', async importOriginal => ({
  ...(await importOriginal()),
  init: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal('__SENTRY_ENVIRONMENT__', 'test');
  vi.stubGlobal('__SENTRY_RELEASE__', 'pyreportal@test');
});

const config: ErrorReportingConfig = {
  dsn: 'https://public@o1.ingest.de.sentry.io/2',
  environment: 'staging',
  release: 'pyreportal@1.8.0+abc1234',
  platform: 'gkt',
  apiBaseUrl: 'https://api.example.test',
  deviceApiKey: 'secret-device-key',
};

function build(overrides: Partial<ErrorReportingConfig> = {}) {
  const options = buildErrorReportingOptions({ ...config, ...overrides });
  if (!options) throw new Error('expected options');
  return options;
}

function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  return build().beforeSend!(event, {}) as ErrorEvent | null;
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return build().beforeBreadcrumb!(breadcrumb);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('removeDeviceKey', () => {
  it('removes key from an absolute URL and keeps other parameters', () => {
    expect(removeDeviceKey('https://kiosk.example.test/?key=secret&mode=x#top')).toBe(
      'https://kiosk.example.test/?mode=x#top'
    );
  });

  it('removes key from a relative path', () => {
    expect(removeDeviceKey('/?key=secret')).toBe('/');
    expect(removeDeviceKey('/rooms?a=1&key=secret')).toBe('/rooms?a=1');
  });

  it('leaves URLs without key unchanged', () => {
    expect(removeDeviceKey('/rooms?monkey=1')).toBe('/rooms?monkey=1');
  });
});

describe('buildErrorReportingOptions', () => {
  it('returns null without a DSN', () => {
    expect(buildErrorReportingOptions({ ...config, dsn: undefined })).toBeNull();
    expect(buildErrorReportingOptions({ ...config, dsn: '' })).toBeNull();
  });

  it('sends through the relay with the device key as Authorization header', () => {
    const options = build();
    expect(options.tunnel).toBe('https://api.example.test/api/iot/error-reports');
    expect(options.transportOptions?.headers).toEqual({
      Authorization: 'Bearer secret-device-key',
    });
  });

  it('omits the Authorization header without a device key', () => {
    expect(build({ deviceApiKey: '' }).transportOptions?.headers).toEqual({});
  });

  it('sets release, environment, platform and the privacy defaults', () => {
    const options = build();
    expect(options.release).toBe('pyreportal@1.8.0+abc1234');
    expect(options.environment).toBe('staging');
    expect(options.initialScope).toEqual({ tags: { platform: 'gkt' } });
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    });
    expect(options.tracePropagationTargets).toEqual([]);
    expect(options.transportOptions).toMatchObject({ maxQueueSize: 30 });
  });

  it('removes the console integration and keeps the other defaults', () => {
    const integrations = build().integrations;
    if (typeof integrations !== 'function') throw new Error('expected an integrations filter');
    const defaults = [{ name: 'Console' }, { name: 'Breadcrumbs' }, { name: 'HttpContext' }];
    expect(integrations(defaults).map(integration => integration.name)).toEqual([
      'Breadcrumbs',
      'HttpContext',
    ]);
  });

  it('buffers offline with IndexedDB and falls back to plain fetch without it', () => {
    vi.stubGlobal('indexedDB', {});
    expect(build().transport).not.toBe(makeFetchTransport);

    vi.stubGlobal('indexedDB', undefined);
    expect(build().transport).toBe(makeFetchTransport);
  });
});

describe('beforeSend', () => {
  it('removes key from the request URL', () => {
    const event = scrubEvent({
      type: undefined,
      request: { url: 'https://kiosk.example.test/?key=secret-device-key&x=1' },
    });
    expect(event?.request?.url).toBe('https://kiosk.example.test/?x=1');
  });

  it('keeps events without a request', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' };
    expect(scrubEvent(event)).toEqual(event);
  });
});

describe('beforeBreadcrumb', () => {
  it('removes key from navigation breadcrumbs', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'navigation',
      data: { from: '/?key=secret-device-key', to: '/pin?key=secret-device-key' },
    });
    expect(breadcrumb?.data).toEqual({ from: '/', to: '/pin' });
  });

  it('removes key from request breadcrumb URLs', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'fetch',
      data: { url: 'https://kiosk.example.test/?key=secret-device-key', status_code: 200 },
    });
    expect(breadcrumb?.data).toEqual({ url: 'https://kiosk.example.test/', status_code: 200 });
  });

  it('drops console breadcrumbs', () => {
    expect(
      scrubBreadcrumb({ category: 'console', message: 'NFC uid 04:D6:94:82:97:6A:80' })
    ).toBeNull();
  });

  it('keeps other breadcrumbs', () => {
    const breadcrumb: Breadcrumb = { category: 'ui.click', message: 'button' };
    expect(scrubBreadcrumb(breadcrumb)).toEqual(breadcrumb);
  });
});

describe('initErrorReporting', () => {
  it('does not start without a DSN', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');

    expect(initErrorReporting()).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('starts with the platform API URL and device key', () => {
    vi.stubEnv('VITE_SENTRY_DSN', config.dsn);
    vi.spyOn(adapter, 'getApiBaseUrl').mockReturnValue(config.apiBaseUrl);
    vi.spyOn(adapter, 'getDeviceApiKey').mockReturnValue(config.deviceApiKey);

    expect(initErrorReporting()).toBe(true);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: config.dsn,
        tunnel: 'https://api.example.test/api/iot/error-reports',
        transportOptions: expect.objectContaining({
          headers: { Authorization: 'Bearer secret-device-key' },
        }),
      })
    );
  });

  it('starts without an Authorization header if the device key is unavailable', () => {
    vi.stubEnv('VITE_SENTRY_DSN', config.dsn);
    vi.spyOn(adapter, 'getDeviceApiKey').mockImplementation(() => {
      throw new Error('missing key');
    });

    expect(initErrorReporting()).toBe(true);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ transportOptions: expect.objectContaining({ headers: {} }) })
    );
  });
});
