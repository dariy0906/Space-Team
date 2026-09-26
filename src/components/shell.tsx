'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Construction,
  LayoutDashboard,
  ListChecks,
  ChartNoAxesCombined,
  MapPinned,
  Menu,
  ScanLine,
  Settings,
  ShieldCheck,
  UserRound,
  Waves,
  X,
} from 'lucide-react';
import Realtime from './realtime';
import { logoutAction } from '@/app/actions';
import { Glyph } from './icons';

import { usePreference } from '@/features/preferences/use-preference';
import { activeNavigation } from '@/features/navigation/active-navigation';

type SimpleUser = { name: string; email: string; role: 'RESIDENT' | 'WORKER' | 'OPERATOR' | 'ADMIN' };
const text = {
  ru: {
    overview: 'Обзор',
    analytics: 'Аналитика',
    incidents: 'События',
    tasks: 'Мои задачи',
    reports: 'Мои обращения',
    road: 'Дороги',
    pipes: 'Карта труб',
    antifraud: 'Антифрод',
    settings: 'Настройки',
    logout: 'Выйти',
    role_ADMIN: 'Администратор',
    role_OPERATOR: 'Оператор',
    role_WORKER: 'Работник',
    role_RESIDENT: 'Житель',
    city: 'Городская платформа безопасности',
  },
  kk: {
    analytics: 'Талдау',
    overview: 'Шолу',
    incidents: 'Оқиғалар',
    tasks: 'Менің тапсырмаларым',
    reports: 'Өтініштерім',
    road: 'Жолдар',
    pipes: 'Құбыр картасы',
    antifraud: 'Антифрод',
    settings: 'Баптаулар',
    logout: 'Шығу',
    role_ADMIN: 'Әкімші',
    role_OPERATOR: 'Оператор',
    role_WORKER: 'Қызметкер',
    role_RESIDENT: 'Тұрғын',
    city: 'Қалалық қауіпсіздік платформасы',
  },
};
export default function Shell({
  user,
  children,
  notifications = 0,
}: {
  user: SimpleUser;
  children: React.ReactNode;
  notifications?: number;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = usePreference('theme', 'light');
  const [language, setLanguage] = usePreference('lang', 'ru');
  const dark = theme === 'dark';
  const lang = language === 'kk' ? 'kk' : 'ru';
  const menu = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menu.current?.querySelector<HTMLElement>('button,a')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('a,button') ?? []).filter(
        (node) => node.getClientRects().length,
      );
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const resize = () => {
      if (window.innerWidth > 900) setOpen(false);
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('resize', resize);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', resize);
      previous?.focus();
    };
  }, [open]);
  const t = text[lang];
  const main = `/${user.role.toLowerCase()}`;
  const nav =
    user.role === 'ADMIN'
      ? [
          { href: '/admin', label: 'Управление', icon: ShieldCheck },
          { href: '/admin/cameras', label: 'Камеры', icon: MapPinned },
        ]
      : user.role === 'OPERATOR'
        ? [
            { href: '/operator/analytics', label: t.analytics, icon: ChartNoAxesCombined },
            { href: main, label: t.overview, icon: LayoutDashboard },
            { href: '/operator/incidents', label: t.incidents, icon: MapPinned },
            { href: '/operator/road', label: t.road, icon: Construction },
          ]
        : user.role === 'WORKER'
          ? [{ href: main, label: t.tasks, icon: ListChecks }]
          : [
              { href: main, label: t.overview, icon: LayoutDashboard },
              { href: '/resident/reports', label: t.reports, icon: MapPinned },
            ];
  nav.push(
    { href: '/pipes', label: t.pipes, icon: Waves },
    { href: '/antifraud', label: t.antifraud, icon: ScanLine },
    { href: '/settings', label: t.settings, icon: Settings },
  );
  const active = activeNavigation(
    path,
    nav.map((item) => item.href),
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        К содержимому
      </a>
      {open && (
        <button
          className="sidebar-backdrop"
          tabIndex={-1}
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="primary-navigation"
        ref={menu}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-label="Основная навигация"
        className={`sidebar ${open ? 'sidebar-open' : ''}`}
      >
        <div className="brand">
          <span className="brand-mark">
            <ShieldCheck size={24} />
          </span>
          <div>
            <strong>DigitalAqtau</strong>
            <small>SMART CITY PLATFORM</small>
          </div>
          <button
            className="mobile-only icon-button ml-auto"
            onClick={() => setOpen(false)}
            aria-label="Закрыть меню"
          >
            <X size={20} />
          </button>
        </div>
        <div className="city-tag">
          <span className="live-dot" /> АКТАУ · ГОРОДСКАЯ СИСТЕМА
        </div>
        <nav aria-label="Разделы приложения">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={`nav-item ${active === item.href ? 'active' : ''}`}
            >
              <item.icon size={19} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <span>
              <i className="live-dot" />
              Система активна
            </span>
            <p>Демонстрационный режим</p>
          </div>
          <form action={logoutAction}>
            <button className="nav-item w-full" type="submit">
              <UserRound size={19} />
              {t.logout}
            </button>
          </form>
        </div>
      </aside>
      <div className="main-column" inert={open}>
        <header className="topbar">
          <button
            ref={menuButton}
            className="mobile-only icon-button"
            aria-expanded={open}
            aria-controls="primary-navigation"
            onClick={() => setOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu size={22} />
          </button>
          <div className="topbar-title">
            <strong>{t.city}</strong>
            <span>Мониторинг городской среды в реальном времени</span>
          </div>
          <div className="top-actions">
            <Realtime />
            <Link
              href="/notifications"
              className="icon-button relative"
              title={`${notifications} уведомлений`}
              aria-label="Уведомления"
            >
              <Bell size={19} />
              {notifications > 0 && <i className="notify-dot" />}
            </Link>
            <button
              className="icon-button"
              title="Тема"
              aria-label="Переключить тему"
              aria-pressed={dark}
              onClick={() => setTheme(dark ? 'light' : 'dark')}
            >
              <Glyph name={dark ? 'sun' : 'moon'} size={18} />
            </button>
            <button className="lang-button" onClick={() => setLanguage(lang === 'ru' ? 'kk' : 'ru')}>
              {lang.toUpperCase()}
            </button>
            <div className="profile-chip">
              <span>{user.name.slice(0, 1)}</span>
              <div>
                <b>{user.name}</b>
                <small>{t[`role_${user.role}`]}</small>
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          {children}
        </main>
        <nav className="mobile-nav" aria-label="Быстрая навигация">
          {nav.slice(0, 4).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? 'page' : undefined}
              className={active === item.href ? 'active' : ''}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
