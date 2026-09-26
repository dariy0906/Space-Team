import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Cctv, CheckCircle2, Construction, ScanSearch, ShieldCheck, Wrench } from 'lucide-react';
import RoadDetectionPanel from '@/components/road-detection-panel';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { sourceLabel } from '@/lib/labels';
import type { RoadMetadata } from '@/lib/road';
export const dynamic = 'force-dynamic';

const pipeline = [
  { icon: Cctv, title: 'Камера', text: 'Кадр с дорожной камеры' },
  { icon: ScanSearch, title: 'CV-детектор', text: 'Поиск повреждений покрытия' },
  { icon: ShieldCheck, title: 'Проверка', text: 'Оператор подтверждает или отклоняет' },
  { icon: Wrench, title: 'Ремонт', text: 'Бригада по очереди работ' },
  { icon: CheckCircle2, title: 'Результат', text: 'Фото «после» и история' },
];

export default async function RoadPage() {
  await requireUser('OPERATOR');
  const [cameras, road] = await Promise.all([
    db.camera.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.incident.findMany({
      where: { type: { in: ['POTHOLE', 'ROAD'] } },
      include: { media: { orderBy: { createdAt: 'desc' }, take: 1 }, camera: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
  ]);
  const pending = road.filter(i => ['NEW', 'WAITING_OPERATOR'].includes(i.status));
  const inRepair = road.filter(i => ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'].includes(i.status));
  const fixed = road.filter(i => i.status === 'RESOLVED').length;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ДОРОГИ · CV-ДЕТЕКЦИЯ</p>
          <h1>Дорожные камеры</h1>
          <p className="subtle">Обнаружение ям и повреждений покрытия по кадрам камер Актау</p>
        </div>
        <span className="badge status-confirmed"><span className="live-dot" /> {cameras.length} камер</span>
      </div>

      <ol className="pipeline-strip">
        {pipeline.map((step, n) => (
          <li key={step.title}>
            <span className="pipeline-step-icon"><step.icon size={18} /></span>
            <div><strong>{n + 1}. {step.title}</strong><small>{step.text}</small></div>
          </li>
        ))}
      </ol>

      <div className="kpi-grid pipe-kpi">
        <div className="kpi"><span><Construction size={13} /> Ожидают проверки</span><strong>{pending.length}</strong><small>обнаружения камер и жалобы</small></div>
        <div className="kpi"><span><Wrench size={13} /> В ремонте</span><strong>{inRepair.length}</strong><small>подтверждены оператором</small></div>
        <div className="kpi"><span><CheckCircle2 size={13} /> Отремонтировано</span><strong>{fixed}</strong><small>с фото результата</small></div>
        <div className="kpi"><span><Cctv size={13} /> Камер в сети</span><strong>{cameras.length}</strong><small>демо-размещение</small></div>
      </div>

      <RoadDetectionPanel cameras={cameras} />

      <div className="dashboard-grid mt-4">
        <section className="panel">
          <div className="panel-header"><div><h2>Ожидают проверки</h2><span>Подтвердите — и событие уйдёт в ремонт</span></div></div>
          <div className="road-queue">
            {pending.map(i => {
              const meta = (i.metadata ?? {}) as Partial<RoadMetadata>;
              return (
                <Link key={i.id} href={`/incidents/${i.id}`} className="road-card">
                  {i.media[0]
                    ? <Image src={i.media[0].url} alt="Кадр обнаружения" width={320} height={200} unoptimized className="road-card-img" />
                    : <div className="road-card-img road-card-noimg"><Construction size={22} /></div>}
                  <div className="road-card-body">
                    <div className="flex justify-between gap-2"><strong>{i.title}</strong><SeverityBadge severity={i.severity} /></div>
                    <p>{i.source === 'CAMERA' ? `Обнаружено у камеры ${meta.cameraName ?? i.camera?.name ?? '—'}` : `${sourceLabel[i.source]} · ${i.address}`}</p>
                    <p>{i.confidence !== null ? `Оценка детектора ${Math.round(i.confidence)}%` : 'Сообщение жителя'}{meta.cameraDetections && meta.cameraDetections > 1 ? ` · замечено ${meta.cameraDetections} раза` : ''}{meta.linkedIncidentIds?.length ? ` · + ${meta.linkedIncidentIds.length} обращ.` : ''}</p>
                    <span className="text-link">Проверить <ArrowUpRight size={14} /></span>
                  </div>
                </Link>
              );
            })}
            {!pending.length && <div className="empty-state"><strong>Очередь пуста</strong>Новые обнаружения появятся здесь автоматически</div>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2>В ремонте</h2><span>Статус работ по дорогам</span></div></div>
          <div className="incident-list">
            {inRepair.map(i => (
              <Link key={i.id} href={`/incidents/${i.id}`} className="incident-card block">
                <div className="flex justify-between gap-2"><strong>{i.title}</strong><StatusBadge status={i.status} /></div>
                <p>{i.address}</p>
              </Link>
            ))}
            {!inRepair.length && <div className="empty-state">Подтверждённых дорожных работ нет</div>}
          </div>
        </section>
      </div>
    </>
  );
}
