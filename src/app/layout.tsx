import type { Metadata, Viewport } from 'next';
import { Onest, Unbounded } from 'next/font/google';
import './globals.css';
// Шрифт скачивается при сборке и отдаётся с нашего сервера. Внешний @import в CSS блокировал
// применение стилей и тормозил переходы после server action.
// Onest — текст и интерфейс (шрифт создан с упором на кириллицу), Unbounded — крупные заголовки и бренд.
const onest = Onest({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--font-body' });
const unbounded = Unbounded({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--font-display' });
export const metadata: Metadata = { title: 'DigitalAqtau — цифровой город Актау', description: 'DigitalAqtau: городская платформа Актау — безопасность, вода, дороги, воздух и обращения жителей', manifest: '/manifest.webmanifest', applicationName: 'DigitalAqtau', icons: { icon: '/icon.svg' } };
export const viewport: Viewport = { themeColor: '#10263b', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru" className={`${onest.variable} ${unbounded.variable}`}><body>{children}<script dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}" }} /></body></html>; }
