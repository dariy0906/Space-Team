'use client';
import {useEffect,useRef,useState} from 'react';
// Realtime-обновление. Next.js `router.refresh()` в этом окружении периодически не применял
// свежий RSC (страница оставалась устаревшей). Для гарантированной демонстрации используем
// автоматическую перезагрузку по событию из durable-outbox. Это НЕ ручной refresh: пользователь
// ничего не нажимает. Перезагрузка откладывается, пока пользователь печатает/отправляет форму.
export default function Realtime(){
 const [online,setOnline]=useState(false);
 const lastReload=useRef(0),pending=useRef(false),busySince=useRef(0);
 useEffect(()=>{
  const source=new EventSource('/api/events');
  // Кнопка отправки заблокирована, пока идёт server action. Иногда клиентский переход Next после
  // действия застревает: сервер всё сохранил и прислал событие, а кнопка так и висит в «Сохраняем…».
  // Раньше это блокировало перезагрузку навсегда. Если занятость длится дольше 8 секунд, считаем
  // страницу свободной — перезагрузка покажет состояние с сервера.
  const idle=()=>{
   if(document.visibilityState!=='visible'||document.activeElement?.matches('input,textarea,select'))return false;
   if(!document.querySelector('button[type=submit]:disabled')){busySince.current=0;return true;}
   if(!busySince.current)busySince.current=Date.now();
   return Date.now()-busySince.current>8000;
  };
  // На /admin live-reload не нужен: действия администратора сами выполняют навигацию,
  // а автоматическая перезагрузка может отменить server-action redirect (например, приглашение камеры).
  const reload=()=>{if(location.pathname.startsWith('/admin'))return;if(!idle())return;const now=Date.now();if(now-lastReload.current<1500)return;lastReload.current=now;window.location.reload();};
  const schedule=()=>{
   if(pending.current)return;pending.current=true;const startUrl=location.href;let tries=0;
   const tick=()=>{if(location.href!==startUrl){pending.current=false;return;}if(idle()||tries>=10){pending.current=false;reload();return;}tries+=1;setTimeout(tick,1200);};
   setTimeout(tick,500);
  };
  source.addEventListener('ready',()=>setOnline(true));
  source.addEventListener('changed',schedule);
  source.addEventListener('unavailable',()=>setOnline(false));
  source.onopen=()=>setOnline(true);source.onerror=()=>setOnline(false);
  return()=>{source.close();};
 },[]);
 return <span className={online?'realtime-state online':'realtime-state'} role="status"><i className="realtime-dot"/>{online?'Live':'Переподключение…'}</span>;
}
