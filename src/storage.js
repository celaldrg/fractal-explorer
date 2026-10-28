/**
 * The only door to localStorage. Every read and write is wrapped in try/catch,
 * so private browsing, disabled storage or a full quota never crash the app.
 */

const PREFIX = 'fractal-explorer:';

/**
 * @typedef {{getItem(key: string): string|null, setItem(key: string, value: string): void}} StorageLike
 */

/**
 * The browser's localStorage, or null where it is missing or blocked.
 * @returns {StorageLike|null}
 */
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads a JSON value saved with writeStored.
 * @template T
 * @param {string} key
 * @param {T} fallback returned when nothing usable is stored
 * @param {StorageLike|null} [storage] defaults to localStorage
 * @returns {T|unknown}
 */
export function readStored(key, fallback, storage = browserStorage()) {
  try {
    const text = storage ? storage.getItem(PREFIX + key) : null;
    return text === null ? fallback : JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * Saves a value as JSON.
 * @param {string} key
 * @param {unknown} value
 * @param {StorageLike|null} [storage] defaults to localStorage
 * @returns {boolean} true when the value was stored
 */
export function writeStored(key, value, storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
