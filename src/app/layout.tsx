import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import LocaleBridge from '@/features/i18n/locale-bridge';
import './globals.css';

const manrope = Manrope({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-manrope' });
export const metadata: Metadata = { title: 'SU AQTAU — городская безопасность', description: 'Демонстрационная платформа городской безопасности Актау', manifest: '/manifest.webmanifest', applicationName: 'SU AQTAU', icons: { icon: '/icon.svg' } };
export const viewport: Viewport = { themeColor: '#10263b', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru" className={manrope.variable}><body>{children}<LocaleBridge/><script dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}" }} /></body></html>; }
