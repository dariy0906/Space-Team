import Link from 'next/link';
import Image from 'next/image';
import type {Incident,IncidentMedia} from '@prisma/client';
import {StatusBadge} from './badges';
import {typeLabel} from '@/lib/labels';
export default function ReportCard({incident:i}:{incident:Incident&{media:IncidentMedia[]}}){return <Link href={'/incidents/'+i.id} className="incident-card block">{i.media[0]&&<Image src={i.media[0].url} alt="Фото обращения" width={500} height={220} unoptimized className="media-preview"/>}<p>№ {i.id.slice(0,8).toUpperCase()} · {typeLabel[i.type]}</p><strong>{i.title}</strong><p>{i.address} · {i.createdAt.toLocaleDateString('ru-RU')}</p><div className="mt-3"><StatusBadge status={i.status}/></div></Link>;}

