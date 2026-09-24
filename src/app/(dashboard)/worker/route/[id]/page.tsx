import {notFound} from 'next/navigation';
import MapView from '@/components/map-view';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {routing} from '@/lib/routing';
export default async function RoutePage({params}:{params:Promise<{id:string}>}){
 const u=await requireUser('WORKER');const {id}=await params;const task=await db.workerTask.findUnique({where:{incidentId:id},include:{incident:true}});if(!task||task.workerId!==u.id)notFound();
 const start={lat:u.lat??43.653,lng:u.lng??51.174};const route=await routing.route(start,task.incident).catch(()=>null);
 return <><div className="page-heading"><div><p className="eyebrow">МАРШРУТ · АВТОМОБИЛЬ</p><h1>К месту происшествия</h1><p className="subtle">{task.incident.address}</p></div></div><section className="panel"><div className="panel-body">{route?<strong>{(route.distanceMeters/1000).toFixed(1)} км · {Math.ceil(route.durationSeconds/60)} мин · OSRM, без учёта пробок</strong>:<p className="error-banner">Маршрутизатор недоступен. Показаны только точки, маршрут не рассчитан.</p>}</div><MapView points={[{id:u.id,title:'Последняя позиция работника',...start,kind:'worker'},{id,title:task.incident.title,lat:task.incident.lat,lng:task.incident.lng,kind:'incident'}]} route={route?.coordinates}/><p className="panel-body subtle">Начало — последняя сохранённая позиция. В демо это позиция из seed.</p></section></>;
}

