// Thin persistence layer. Everything the app needs is serialized to localStorage
// under a single key. This module is the ONLY place that touches the browser
// storage API, so it can be swapped for an Express/SQLite backend later without
// changing the reducer or UI (same load()/save() contract).

const STORAGE_KEY = 'balanceboard.v1';

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read saved data, starting fresh.', err);
    return null;
  }
}

export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to persist data.', err);
  }
}

export function clear() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear data.', err);
  }
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
