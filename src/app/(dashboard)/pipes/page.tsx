import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { sourceLabel } from '@/lib/labels';
import PipeNetworkView from '@/components/pipe-network-view';
import type { MapPoint } from '@/components/map';

export const dynamic = 'force-dynamic';

export default async function PipesPage() {
  await requireUser();
  // На схеме сети показываются события, связанные с водой: утечки и происшествия на воде.
  const incidents = await db.incident.findMany({
    where: { type: { in: ['WATER_LEAK', 'WATER_RESCUE'] }, status: { notIn: ['RESOLVED', 'REJECTED'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const points: MapPoint[] = incidents.map(incident => ({
    id: incident.id,
    title: incident.title,
    lat: incident.lat,
    lng: incident.lng,
    severity: incident.severity,
    type: incident.type,
    kind: 'incident',
    subtitle: `${incident.address} · ${sourceLabel[incident.source]}`,
  }));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ИНФРАСТРУКТУРА</p>
          <h1>Карта труб</h1>
          <p className="subtle">Водопроводная сеть Актау: состояние, износ и приоритет замены</p>
        </div>
        <span className="badge status-confirmed"><span className="live-dot" /> Данные сети загружены</span>
      </div>
      <PipeNetworkView points={points} />
    </>
  );
}
