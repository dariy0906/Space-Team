'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Refresh server data while preserving forms, maps and camera connections. */
export default function Realtime() {
  const router = useRouter();
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const source = new EventSource('/api/events');
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      if (!pending) return;
      const editing = document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
      if (
        document.visibilityState !== 'visible' ||
        editing ||
        document.querySelector('button[type="submit"]:disabled')
      ) {
        timer = setTimeout(flush, 1000);
        return;
      }
      pending = false;
      router.refresh();
    };
    const schedule = () => {
      pending = true;
      timer ??= setTimeout(flush, 500);
    };
    source.addEventListener('ready', () => {
      setOnline(true);
      schedule();
    });
    source.addEventListener('changed', schedule);
    source.addEventListener('unavailable', () => setOnline(false));
    source.onerror = () => setOnline(false);
    return () => {
      source.close();
      clearTimeout(timer);
    };
  }, [router]);
  return (
    <span className={`realtime-state${online ? ' online' : ''}`} role="status">
      <i className="realtime-dot" />
      {online ? 'Live' : 'Переподключение…'}
    </span>
  );
}
