import type { PlatformAdapter } from '../adapter';
import { adapter as gktAdapter } from '../gkt';
import { adapter as wedgeAdapter } from '../wedge';

// The WebView injects GKTKiosk before page scripts run. SYSTEM alone is not
// evidence of native hardware: our system.js defines it in every browser.
declare const GKTKiosk: unknown;

export const adapter: PlatformAdapter =
  typeof GKTKiosk !== 'undefined' && GKTKiosk !== null ? gktAdapter : wedgeAdapter;
