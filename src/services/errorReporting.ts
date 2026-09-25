/**
 * Crash reporting to Sentry (project `pyreportal`).
 *
 * Events go through the backend relay `POST /api/iot/error-reports`, which
 * authenticates the device key and adds `device_id` and `school_id`. The
 * device key and wristband UIDs must never reach Sentry: `key` is removed
 * from every URL, and console breadcrumbs are off because system.js logs
 * UIDs to the console. `dataCollection` keeps IP, cookies, bodies, query
 * parameters and all headers but User-Agent out; it does not cover the
 * request URL, hence the `key` filter.
 */

import { adapter } from '@platform';
import {
  init,
  makeBrowserOfflineTransport,
  makeFetchTransport,
  type BrowserOptions,
  type Breadcrumb,
  type ErrorEvent,
} from '@sentry/react';

import type { Platform } from '../platform/adapter';
import { createLogger, serializeError } from '../utils/logger';

const logger = createLogger('ErrorReporting');

const ERROR_REPORTS_PATH = '/api/iot/error-reports';
const OFFLINE_QUEUE_SIZE = 30;
const KEY_PARAM = /[?&]key=/;
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;
// v11 records console breadcrumbs through this default integration.
const CONSOLE_INTEGRATION = 'Console';

export interface ErrorReportingConfig {
  dsn: string | undefined;
  environment: string;
  release: string;
  platform: Platform;
  apiBaseUrl: string;
  deviceApiKey: string;
}

/** Removes the `key` query parameter (the device API key) from a URL or path. */
export function removeDeviceKey(url: string): string {
  if (!KEY_PARAM.test(url)) return url;
  const parsed = new URL(url, 'https://relative.invalid');
  parsed.searchParams.delete('key');
  return HAS_SCHEME.test(url) ? parsed.href : parsed.pathname + parsed.search + parsed.hash;
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request?.url) request.url = removeDeviceKey(request.url);
  return event;
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'console') return null;
  const data = breadcrumb.data;
  if (data) {
    for (const field of ['from', 'to', 'url'] as const) {
      const value: unknown = data[field];
      if (typeof value === 'string') data[field] = removeDeviceKey(value);
    }
  }
  return breadcrumb;
}

/** Builds the Sentry options, or null when no DSN is configured. */
export function buildErrorReportingOptions(config: ErrorReportingConfig): BrowserOptions | null {
  if (!config.dsn) return null;

  // Not buildAuthHeaders(): this runs before initializeApi() sets its key.
  const headers: Record<string, string> = config.deviceApiKey
    ? { Authorization: `Bearer ${config.deviceApiKey}` }
    : {};
  // maxQueueSize is an option of the offline transport, which BrowserOptions
  // does not type.
  const transportOptions = { maxQueueSize: OFFLINE_QUEUE_SIZE, headers };

  return {
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    tracePropagationTargets: [],
    tunnel: `${config.apiBaseUrl}${ERROR_REPORTS_PATH}`,
    // Without IndexedDB the kiosk runs without an offline buffer.
    transport:
      typeof indexedDB === 'undefined'
        ? makeFetchTransport
        : makeBrowserOfflineTransport(makeFetchTransport),
    transportOptions,
    integrations: defaults =>
      defaults.filter(integration => integration.name !== CONSOLE_INTEGRATION),
    initialScope: { tags: { platform: config.platform } },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

function readDeviceApiKey(): string {
  try {
    return adapter.getDeviceApiKey();
  } catch (error) {
    // A kiosk URL without ?key= still reports; the relay answers 401.
    logger.warn('Error reporting starts without device key', { error: serializeError(error) });
    return '';
  }
}

/**
 * Starts Sentry when the build carries a DSN. Runs before initializeApi() so
 * startup failures are reported. Returns whether Sentry is running.
 */
export function initErrorReporting(): boolean {
  const options = buildErrorReportingOptions({
    dsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
    environment: __SENTRY_ENVIRONMENT__,
    release: __SENTRY_RELEASE__,
    platform: adapter.platform,
    apiBaseUrl: adapter.getApiBaseUrl(),
    deviceApiKey: readDeviceApiKey(),
  });
  if (!options) return false;
  init(options);
  return true;
}
