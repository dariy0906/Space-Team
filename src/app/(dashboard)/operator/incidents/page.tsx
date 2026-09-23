import { Prisma } from '@prisma/client';
import IncidentCard from '@/components/incident-card';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { severityLabel, sourceLabel, statusLabel, typeLabel } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function Incidents({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) { await requireUser('OPERATOR'); const q = await searchParams; const where: Prisma.IncidentWhereInput = {};
  if (q.type && q.type in typeLabel) where.type = q.type as keyof typeof typeLabel;
  if (q.status && q.status in statusLabel) where.status = q.status as keyof typeof statusLabel;
  if (q.severity && q.severity in severityLabel) where.severity = q.severity as keyof typeof severityLabel;
  if (q.source && q.source in sourceLabel) where.source = q.source as keyof typeof sourceLabel;
  if (q.district) where.district = { contains:q.district, mode:'insensitive' };
  if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) { const start = new Date(`${q.date}T00:00:00Z`); const end = new Date(start.getTime()+86400000); where.createdAt = { gte:start, lt:end }; }
  const incidents = await db.incident.findMany({ where, orderBy:{createdAt:'desc'},take:200 });
  return <><div className="page-heading"><div><p className="eyebrow">РЕЕСТР</p><h1>Все события</h1><p className="subtle">Фильтруйте инциденты по типу, статусу и месту</p></div><span className="badge status-new">{incidents.length} записей</span></div><form className="filters"><select name="type" defaultValue={q.type ?? ''}><option value="">Все типы</option>{Object.entries(typeLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select name="status" defaultValue={q.status ?? ''}><option value="">Все статусы</option>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select name="severity" defaultValue={q.severity ?? ''}><option value="">Вся важность</option>{Object.entries(severityLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select name="source" defaultValue={q.source ?? ''}><option value="">Все источники</option>{Object.entries(sourceLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><input name="district" placeholder="Микрорайон" defaultValue={q.district ?? ''}/><input name="date" type="date" defaultValue={q.date ?? ''}/><button className="button">Применить</button></form><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{incidents.map(i=><IncidentCard key={i.id} incident={i}/>)}</div>{incidents.length===0&&<div className="panel empty-state"><strong>Ничего не найдено</strong>Измените фильтры</div>}</>;
}
