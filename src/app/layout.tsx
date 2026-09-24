import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'SU AQTAU — городская безопасность', description: 'Демонстрационная платформа городской безопасности Актау', manifest: '/manifest.webmanifest', applicationName: 'SU AQTAU', icons: { icon: '/icon.svg' } };
export const viewport: Viewport = { themeColor: '#10263b', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru"><body>{children}<script dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}" }} /></body></html>; }
