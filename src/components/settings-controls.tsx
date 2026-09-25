'use client';
import { useEffect, useState } from 'react';
import { usePreference } from '@/features/preferences/use-preference';
type InstallPrompt = Event & { prompt: () => Promise<void> };
export default function SettingsControls() {
  const [theme, setTheme] = usePreference('theme', 'light');
  const [lang, setLang] = usePreference('lang', 'ru');
  const [notify, setNotify] = useState(false);
  const [geo, setGeo] = useState(false);
  const [share, setShare] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    try {
      setNotify(localStorage.getItem('notifications') === 'true');
      setGeo(localStorage.getItem('geolocation') === 'true');
      setShare(localStorage.getItem('sharing') === 'true');
    } catch {
      /* Optional browser storage. */
    }
    const handler = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  function save(name: string, value: string) {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* Optional browser storage. */
    }
    if (name === 'theme') document.documentElement.classList.toggle('dark', value === 'dark');
  }
  return (
    <div className="settings-grid">
      <section className="panel panel-body">
        <h2 className="font-extrabold mb-3">Интерфейс</h2>
        <div className="settings-row">
          <div>
            <strong>Тема</strong>
            <small>Светлая или тёмная</small>
          </div>
          <select
            aria-label="Тема"
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
            }}
            className="lang-button"
          >
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </div>
        <div className="settings-row">
          <div>
            <strong>Язык</strong>
            <small>Русский / Қазақша</small>
          </div>
          <select
            aria-label="Язык навигации"
            value={lang}
            onChange={(e) => {
              setLang(e.target.value);
            }}
            className="lang-button"
          >
            <option value="ru">Русский</option>
            <option value="kk">Қазақша</option>
          </select>
        </div>
        <div className="settings-row">
          <div>
            <strong>Уведомления</strong>
            <small>Локальная настройка браузера</small>
          </div>
          <input
            type="checkbox"
            aria-label="Уведомления"
            checked={notify}
            onChange={(e) => {
              setNotify(e.target.checked);
              save('notifications', String(e.target.checked));
            }}
          />
        </div>
      </section>
      <section className="panel panel-body">
        <h2 className="font-extrabold mb-3">Местоположение</h2>
        <div className="settings-row">
          <div>
            <strong>Геолокация</strong>
            <small>Разрешение выдаётся браузером</small>
          </div>
          <input
            type="checkbox"
            aria-label="Геолокация"
            checked={geo}
            onChange={(e) => {
              setGeo(e.target.checked);
              save('geolocation', String(e.target.checked));
              if (e.target.checked)
                navigator.geolocation?.getCurrentPosition(
                  () => {},
                  () => {},
                );
            }}
          />
        </div>
        <div className="settings-row">
          <div>
            <strong>Sharing location</strong>
            <small>Друзья и обмен позициями ещё не подключены</small>
          </div>
          <input
            type="checkbox"
            aria-label="Обмен местоположением (недоступно)"
            disabled
            checked={share}
            onChange={(e) => {
              setShare(e.target.checked);
              save('sharing', String(e.target.checked));
            }}
          />
        </div>
      </section>
      <section className="panel panel-body">
        <h2 className="font-extrabold mb-3">Мобильное приложение</h2>
        <p className="subtle">Установите веб-версию на главный экран устройства.</p>
        <div className="actions-row">
          <button className="button" disabled={!install} onClick={() => install?.prompt()}>
            Установить PWA
          </button>
          <button className="button secondary" disabled>
            Скачать APK · позже
          </button>
        </div>
      </section>
    </div>
  );
}
