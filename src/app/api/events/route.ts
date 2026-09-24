import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { dispatchCritical } from '@/lib/dispatch';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request) {
  const user=await currentUser();
  if(!user) return new Response('Unauthorized',{status:401});
  const last=request.headers.get('last-event-id');
  let cursor=last&&/^\d+$/.test(last)?BigInt(last):(await db.realtimeEvent.aggregate({_max:{id:true}}))._max.id??0n;
  let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
  const encoder=new TextEncoder();
  const stream=new ReadableStream({
    start(controller) {
      const finish=()=>{closed=true;if(timer) clearTimeout(timer);try{controller.close();}catch{}};
      request.signal.addEventListener('abort',finish,{once:true});
      const tick=async()=>{
        if(closed) return;
        try {
          if(user.role==='OPERATOR') await dispatchCritical();
          const events=await db.realtimeEvent.findMany({where:{id:{gt:cursor},OR:[{userId:user.id},{role:user.role}]},orderBy:{id:'asc'},take:100});
          if(closed) return;
          if(events.length) {
            cursor=events[events.length-1].id;
            controller.enqueue(encoder.encode('id: '+cursor+'\nevent: changed\ndata: {}\n\n'));
          }else controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }catch {if(!closed)controller.enqueue(encoder.encode('event: unavailable\ndata: {}\n\n'));}
        if(!closed) timer=setTimeout(tick,1500);
      };
      controller.enqueue(encoder.encode('event: ready\ndata: {}\n\n'));void tick();
    },
    cancel(){closed=true;if(timer)clearTimeout(timer);}
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
}

