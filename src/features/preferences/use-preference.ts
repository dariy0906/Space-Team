'use client';
import { useSyncExternalStore } from 'react';

const eventName = 'aqtau:preferences';
function read(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function subscribe(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener(eventName, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(eventName, notify);
  };
}
export function usePreference(key: string, fallback: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const setValue = (next: string) => {
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Storage may be disabled. */
    }
    if (key === 'theme') document.documentElement.classList.toggle('dark', next === 'dark');
    window.dispatchEvent(new Event(eventName));
  };
  return [value, setValue] as const;
}
