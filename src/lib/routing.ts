import { z } from 'zod';
export type Coordinate = {lat:number;lng:number};
export const inAktau = (p:Coordinate) => p.lat>=43.57 && p.lat<=43.78 && p.lng>=51.08 && p.lng<=51.30;
export type RouteResult = {provider:string;coordinates:[number,number][];distanceMeters:number;durationSeconds:number;trafficAware:boolean};
export interface RoutingProvider {route(start:Coordinate,end:Coordinate):Promise<RouteResult>;}
const routeSchema = z.object({code:z.literal('Ok'),routes:z.array(z.object({distance:z.number().nonnegative(),duration:z.number().nonnegative(),geometry:z.object({coordinates:z.array(z.tuple([z.number(),z.number()]))})})).min(1)});
export class OsrmRoutingProvider implements RoutingProvider {
  async route(start:Coordinate,end:Coordinate):Promise<RouteResult> {
    if(!inAktau(start)||!inAktau(end)) throw new Error('Маршруты доступны только в пределах Актау');
    const base=process.env.ROUTING_URL||'https://router.project-osrm.org';
    const res=await fetch(`${base}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`,{signal:AbortSignal.timeout(6000),cache:'no-store'});
    if(!res.ok) throw new Error('Сервис маршрутов недоступен');
    const r=routeSchema.parse(await res.json()).routes[0];
    if(r.geometry.coordinates.some(([lng,lat])=>!inAktau({lat,lng}))) throw new Error('Маршрут выходит за пределы Актау');
    return {provider:'OSRM',coordinates:r.geometry.coordinates,distanceMeters:r.distance,durationSeconds:r.duration,trafficAware:false};
  }
}
export const routing:RoutingProvider = new OsrmRoutingProvider();
export function distanceMeters(a:Coordinate,b:Coordinate) {
  const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad, dlng=(b.lng-a.lng)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

