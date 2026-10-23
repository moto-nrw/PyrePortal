const STORAGE_KEY = 'moto_device_api_key';

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
    // Scrub even if persistence fails. Never leave a key in restart URLs.
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (key) localStorage.setItem(STORAGE_KEY, key);
  }
  return key === ''
    ? localStorage.getItem(STORAGE_KEY)
    : (key ?? localStorage.getItem(STORAGE_KEY));
}
