import {notFound} from 'next/navigation';
import PhoneCamera from '@/components/phone-camera';
import {cameraSession} from '@/lib/cameras';
export const metadata={title:'Добровольная демо-камера · SU AQTAU',referrer:'no-referrer'};
export default async function CameraPage({params}:{params:Promise<{token:string}>}){const {token}=await params;const s=await cameraSession(token);if(!s)notFound();return <main className="phone-page"><p className="eyebrow">SU AQTAU · DEMO CAMERA</p><h1>{s.camera.name}</h1><p>После согласия оператор сможет видеть видеопоток. При подключённом CV сервисе отдельные кадры анализируются для обнаружения возможного падения. Звук не передаётся, распознавания лиц нет.</p><PhoneCamera token={token}/></main>;}

