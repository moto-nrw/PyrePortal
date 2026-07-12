import { describe, expect, it } from 'vitest';

import { getNetworkErrorMessage } from './apiErrors';

/**
 * Freezes the user-visible German network error copy per context.
 *
 * These wordings were previously scattered as string literals across
 * apiClient, pages, store slices and checkoutDestinationService. They must
 * stay byte-identical so the visible UI copy does not change.
 */
describe('getNetworkErrorMessage', () => {
  it('returns the generic message by default', () => {
    expect(getNetworkErrorMessage()).toBe('Netzwerkfehler. Bitte Verbindung prüfen.');
  });

  it('returns the exact historical wording per context', () => {
    expect(getNetworkErrorMessage('generic')).toBe('Netzwerkfehler. Bitte Verbindung prüfen.');
    expect(getNetworkErrorMessage('retry')).toBe(
      'Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.'
    );
    expect(getNetworkErrorMessage('sessionStart')).toBe(
      'Netzwerkfehler beim Starten der Aktivität. Bitte Verbindung prüfen und erneut versuchen.'
    );
    expect(getNetworkErrorMessage('sessionValidation')).toBe(
      'Netzwerkfehler bei der Überprüfung der gespeicherten Sitzung. Bitte Verbindung prüfen und erneut versuchen.'
    );
    expect(getNetworkErrorMessage('schulhofCheckin')).toBe(
      'Netzwerkfehler bei Schulhof-Anmeldung. Bitte Verbindung prüfen und erneut scannen.'
    );
    expect(getNetworkErrorMessage('toiletteCheckin')).toBe(
      'Netzwerkfehler bei Toilette-Anmeldung. Bitte Verbindung prüfen und erneut scannen.'
    );
  });
});
