const STORAGE_KEY = 'moto_device_api_key';
let inMemoryCredential: string | null = null;

// Import a provisioning credential once. The query fallback lasts only until
// slice 3841-k; fragment values take precedence when replacing a legacy key.
export function readDeviceCredential(): string | null {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const fragmentKey = fragment.get('key');
  const key =
    fragmentKey === '' ? url.searchParams.get('key') : (fragmentKey ?? url.searchParams.get('key'));
  if (fragment.has('key') || url.searchParams.has('key')) {
    url.searchParams.delete('key');
    fragment.delete('key');
    url.hash = fragment.toString();
    // Hold the new credential before scrubbing, even if storage rejects writes.
    if (key) inMemoryCredential = key;
    // Never leave a credential in restart URLs.
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (key) {
      try {
        localStorage.setItem(STORAGE_KEY, key);
      } catch {
        // Never report the credential, URL, or the storage exception's contents.
        // The logger imports @platform; importing it here would create a startup cycle.
        // eslint-disable-next-line no-console
        console.warn(
          'Device credential could not be saved. Using memory only; reimport after reloading.'
        );
      }
    }
  }
  return inMemoryCredential ?? localStorage.getItem(STORAGE_KEY);
}
