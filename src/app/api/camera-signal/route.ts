import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {cameraSession,sameOrigin} from '@/lib/cameras';
import {db} from '@/lib/db';
const peer=z.string().uuid();
async function access(request:Request){
 const q=new URL(request.url).searchParams,token=q.get('token');
 if(token){const s=await cameraSession(token);return s?.status==='ACTIVE'&&s.permission?{session:s,sender:'phone',peerId:null}:null;}
 const user=await currentUser();if(!user||!['OPERATOR','ADMIN'].includes(user.role))return null;
 const id=z.string().uuid().safeParse(q.get('session'));if(!id.success)return null;
 const s=await db.cameraSession.findFirst({where:{id:id.data,status:'ACTIVE',expiresAt:{gt:new Date()},camera:{status:{not:'DISABLED'}}},include:{permission:true}});
 const p=peer.safeParse(q.get('peer'));return s?.permission&&p.success?{session:s,sender:'viewer',peerId:user.id+':'+p.data}:null;
}
export async function GET(request:Request){
 const a=await access(request);if(!a)return new Response('Forbidden or expired',{status:403});
 const q=new URL(request.url).searchParams;const after=Math.max(0,Number(q.get('after')||0));if(!Number.isSafeInteger(after))return new Response('Bad cursor',{status:400});
 const signals=await db.cameraSignal.findMany({where:{sessionId:a.session.id,id:{gt:after},createdAt:{gt:new Date(Date.now()-30000)},sender:a.sender==='phone'?'viewer':'phone',...(a.peerId?{peerId:a.peerId}:{})},orderBy:{id:'asc'},take:100});
 return Response.json({signals},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 if(!sameOrigin(request))return new Response('Forbidden',{status:403});
 if(Number(request.headers.get('content-length')||0)>100000)return new Response('Too large',{status:413});
 const a=await access(request);if(!a)return new Response('Forbidden or expired',{status:403});
 const body=await request.json();if(JSON.stringify(body).length>100000)return new Response('Too large',{status:413});
 const payload=z.object({type:z.enum(['offer','answer','candidate','bye']),sdp:z.string().max(80000).optional(),candidate:z.record(z.unknown()).nullable().optional()}).safeParse(body.payload);
 const peerId=a.peerId||String(body.peerId);if(!payload.success||!/^[-a-f0-9]{36}:[-a-f0-9]{36}$/.test(peerId))return new Response('Bad signal',{status:400});
 if((a.sender==='phone'&&payload.data.type==='offer')||(a.sender==='viewer'&&payload.data.type==='answer'))return new Response('Wrong direction',{status:400});
 if(await db.cameraSignal.count({where:{sessionId:a.session.id,createdAt:{gt:new Date(Date.now()-60000)}}})>500)return new Response('Rate limit',{status:429});
 await db.cameraSignal.create({data:{sessionId:a.session.id,peerId,sender:a.sender,payload:JSON.parse(JSON.stringify(payload.data))}});
 return Response.json({ok:true});
}
