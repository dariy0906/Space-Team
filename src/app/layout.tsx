import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
// Шрифт скачивается при сборке и отдаётся с нашего сервера. Внешний @import в CSS блокировал
// применение стилей и тормозил переходы после server action.
const manrope = Manrope({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-manrope' });
export const metadata: Metadata = { title: 'DigitalAqtau — цифровой город Актау', description: 'DigitalAqtau: городская платформа Актау — безопасность, вода, дороги, воздух и обращения жителей', manifest: '/manifest.webmanifest', applicationName: 'DigitalAqtau', icons: { icon: '/icon.svg' } };
export const viewport: Viewport = { themeColor: '#10263b', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru" className={manrope.variable}><body>{children}<script dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}" }} /></body></html>; }
