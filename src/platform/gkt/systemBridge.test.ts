import { afterEach, describe, expect, it, vi } from 'vitest';

import systemScript from '../../../public/system.js?raw';

interface BridgeSystem {
  registerNfc: (callback: (event: unknown) => void) => void;
  onSensorEvent: (event: Record<string, unknown>) => void;
  onReceiveIntent: (intent: Record<string, unknown>) => void;
  unknownNfc: (uid: string) => void;
  unknownBarcode: (barcode: string) => void;
}

const TAG = '04:D6:94:82:97:6A:80';

// Runs the shipped bridge with a stand-in for the GKT shell's native log.
const loadBridge = (kioskLog: (...args: unknown[]) => void): BridgeSystem => {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluates the shipped vendor script
  const runScript = new Function('GKTKiosk', `${systemScript}\nreturn SYSTEM;`) as (
    kiosk: unknown
  ) => BridgeSystem;
  return runScript({ log: kioskLog });
};

describe('GKT bridge script logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers an NFC scan without writing its UID to the console or the GKT log', () => {
    const consoleCalls = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method =>
      vi.spyOn(console, method).mockImplementation(() => undefined)
    );
    const kioskLog = vi.fn();
    const system = loadBridge(kioskLog);
    const onNfc = vi.fn();
    system.registerNfc(onNfc);

    const event = { eventSource: 'nfc', uid: TAG, eventNumber: 1 };
    system.onSensorEvent(event);
    system.onReceiveIntent({ action: 'de.gekartel.VALUECHANGED', extras: event });
    system.unknownNfc(TAG);
    system.unknownBarcode(TAG);
    system.onSensorEvent({ eventSource: 'barcode', barcode: TAG });

    expect(onNfc).toHaveBeenCalledWith(event);
    const written = JSON.stringify([
      ...consoleCalls.flatMap(spy => spy.mock.calls),
      ...kioskLog.mock.calls,
    ]);
    expect(written).not.toContain(TAG);
  });
});
