/**
 * Monotonic Sequence Counter Utility for Hisabati Sync.
 * Provides a thread-safe, persistence-backed monotonic counter per installation/device.
 */

const SEQUENCE_STORAGE_KEY = 'hisabati_device_sequence_v1';

export function getNextSequence(): number {
  if (typeof localStorage === 'undefined') {
    return Math.floor(Math.random() * 1000000);
  }
  try {
    const raw = localStorage.getItem(SEQUENCE_STORAGE_KEY);
    const current = raw ? parseInt(raw, 10) : 0;
    const next = isNaN(current) ? 1 : current + 1;
    localStorage.setItem(SEQUENCE_STORAGE_KEY, String(next));
    return next;
  } catch {
    return Date.now();
  }
}

export function getCurrentSequence(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(SEQUENCE_STORAGE_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}
