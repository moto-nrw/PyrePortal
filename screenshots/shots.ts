// The shot list of the kiosk product screenshots, in the order of the user
// journey in capture.spec.ts. A shot's ID names its files and stays the same
// across releases (German kebab case, umlauts as ae/oe/ue), like the IDs in
// project-phoenix frontend/scripts/product-screenshots/shots.yaml.

export const SHOTS = [
  { id: 'start', titel: 'Startbildschirm' },
  { id: 'pin-eingabe', titel: 'PIN-Eingabe' },
  { id: 'startseite', titel: 'Startseite' },
  { id: 'armband-identifizieren', titel: 'Armband identifizieren' },
  { id: 'armband-scan-laeuft', titel: 'Armband wird erkannt' },
  { id: 'armband-erkannt', titel: 'Armband erkannt' },
  { id: 'kind-auswaehlen', titel: 'Kind auswählen' },
  { id: 'kind-nach-klasse-filtern', titel: 'Kinder nach Klasse filtern' },
  { id: 'ogs-gruppe-waehlen', titel: 'OGS-Gruppe wählen' },
  { id: 'kind-ausgewaehlt', titel: 'Kind ausgewählt' },
  { id: 'armband-zugewiesen', titel: 'Armband zugewiesen' },
  { id: 'startseite-zurueck', titel: 'Zurück auf der Startseite' },
  { id: 'team-anpassen', titel: 'Team anpassen' },
  { id: 'team-ausgewaehlt', titel: 'Team ausgewählt' },
  { id: 'team-gespeichert', titel: 'Team gespeichert' },
  { id: 'aktivitaet-waehlen', titel: 'Aktivität wählen' },
  { id: 'aktivitaet-ausgewaehlt', titel: 'Aktivität ausgewählt' },
  { id: 'betreuer-waehlen', titel: 'Betreuer wählen' },
  { id: 'betreuer-ausgewaehlt', titel: 'Betreuer ausgewählt' },
  { id: 'raum-waehlen', titel: 'Raum wählen' },
  { id: 'aufsicht-starten-bestaetigen', titel: 'Aufsicht starten?' },
  { id: 'nfc-scan-bereit', titel: 'Bereit zum Scannen' },
  { id: 'einchecken', titel: 'Kind checkt ein' },
  { id: 'auschecken-wohin', titel: 'Wohin geht das Kind?' },
  { id: 'tages-feedback', titel: 'Wie war dein Tag?' },
  { id: 'verabschiedung', titel: 'Tschüss' },
  { id: 'abholzeit-abfragen', titel: 'Abholzeit abfragen' },
  { id: 'abholzeit-ergebnis', titel: 'Abholzeit' },
  { id: 'scan-fehler', titel: 'Scan fehlgeschlagen' },
  { id: 'startseite-aktive-aufsicht', titel: 'Startseite mit laufender Aufsicht' },
  { id: 'aufsicht-beenden', titel: 'Aufsicht beenden?' },
  { id: 'startseite-letzte-aufsichten', titel: 'Startseite mit letzten Aufsichten' },
  { id: 'aufsichtsverlauf', titel: 'Letzte Aufsichten' },
  { id: 'aufsicht-neu-starten', titel: 'Neue Aufsicht starten?' },
  { id: 'verlauf-loeschen', titel: 'Verlauf löschen?' },
] as const satisfies readonly Shot[];

export interface Shot {
  readonly id: string;
  readonly titel: string;
}

export type ShotId = (typeof SHOTS)[number]['id'];

/** Written by capture.spec.ts per device: the route each shot was taken on. */
export const CAPTURED_FILE = 'captured.json';
export type CapturedShots = Record<string, { readonly pfad: string }>;
