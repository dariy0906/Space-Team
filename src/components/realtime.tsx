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
    let busySince = 0;
    const flush = () => {
      timer = undefined;
      if (!pending) return;
      const editing = document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
      // Кнопка отправки может остаться заблокированной, если клиентский переход после действия
      // застрял. Дольше 8 секунд такую «занятость» не ждём — обновление покажет данные с сервера.
      const submitting = document.querySelector('button[type="submit"]:disabled');
      if (submitting) busySince ||= Date.now();
      else busySince = 0;
      if (
        document.visibilityState !== 'visible' ||
        editing ||
        (submitting && Date.now() - busySince < 8000)
      ) {
        timer = setTimeout(flush, 1000);
        return;
      }
      pending = false;
      // Зависший переход router.refresh не снимает: сервер уже всё сохранил, поэтому перезагружаем
      // страницу целиком. На /admin не перезагружаем — это может отменить redirect server action.
      if (submitting && !location.pathname.startsWith('/admin')) {
        window.location.reload();
        return;
      }
      busySince = 0;
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
