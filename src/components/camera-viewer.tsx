'use client';
import {useEffect,useRef,useState} from 'react';
export default function CameraViewer({sessionId}:{sessionId:string}){
 const video=useRef<HTMLVideoElement>(null),[status,setStatus]=useState('CONNECTING · подключение…'),[live,setLive]=useState(false);
 useEffect(()=>{
  const element=video.current;
  let pc:RTCPeerConnection|undefined,timer:ReturnType<typeof setTimeout>,closed=false,cursor=0;
  const url='/api/camera-signal?session='+sessionId+'&peer='+crypto.randomUUID();const pending:RTCIceCandidateInit[]=[];
  const post=async(payload:unknown)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload})});if(!r.ok)throw new Error('STOPPED · сессия недоступна');};
  async function start(){
   pc=new RTCPeerConnection(await (await fetch('/api/rtc')).json());
   if(closed){pc.close();return;}
   pc.ontrack=e=>{if(video.current)video.current.srcObject=e.streams[0]||new MediaStream([e.track]);};
   pc.onconnectionstatechange=()=>{if(closed)return;const st=pc?.connectionState;
    if(st==='connected'){setLive(true);setStatus('LIVE · камера активна');}
    else if(st==='failed')setStatus('DISCONNECTED · не удалось соединиться (возможно, нужен TURN)');
    else if(st==='disconnected'){setLive(false);setStatus('DISCONNECTED · соединение прервано');}
    else if(st==='connecting'||st==='new')setStatus('CONNECTING · установка соединения');};
   pc.onicecandidate=e=>{if(e.candidate)void post({type:'candidate',candidate:e.candidate.toJSON()}).catch(()=>{});};
   pc.addTransceiver('video',{direction:'recvonly'});await pc.setLocalDescription(await pc.createOffer());await post({type:'offer',sdp:pc.localDescription?.sdp});
   const poll=async()=>{
    if(closed)return;
    try{const r=await fetch(url+'&after='+cursor);if(!r.ok){setLive(false);setStatus('STOPPED · сессия остановлена или истекла');pc!.close();return;}
     const {signals}=await r.json();
     for(const s of signals){cursor=Math.max(cursor,s.id);const p=s.payload;if(p.type==='answer'){await pc!.setRemoteDescription({type:'answer',sdp:p.sdp});for(const c of pending.splice(0))await pc!.addIceCandidate(c);}else if(p.type==='candidate'&&p.candidate){if(pc!.remoteDescription)await pc!.addIceCandidate(p.candidate);else pending.push(p.candidate);}else if(p.type==='bye'){setLive(false);setStatus('STOPPED · владелец остановил камеру');pc!.close();return;}}
    }catch(e){setLive(false);setStatus('DISCONNECTED · '+ (e instanceof Error?e.message:'соединение потеряно'));pc?.close();return;}
    if(!closed)timer=setTimeout(poll,1000);
   };void poll();
  }
  void start().catch(e=>{if(!closed)setStatus(e instanceof Error?e.message:'DISCONNECTED');});
  return()=>{closed=true;clearTimeout(timer);pc?.close();if(element)element.srcObject=null;};
 },[sessionId]);
 return <><video ref={video} autoPlay playsInline muted className="camera-preview"/><p className={live?'camera-live':'subtle'} role="status" data-state={status.split(' ')[0]}>{status}</p></>;
}
