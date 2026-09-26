'use client';
import { useEffect, useRef, useState } from 'react';
export default function PhoneCamera({ token }: { token: string }) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    cleanup = useRef<() => void>(() => {});
  const [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('INVITED · камера выключена'),
    [link, setLink] = useState(''),
    [cv, setCv] = useState('');
  const generation = useRef(0);
  const [ready, setReady] = useState(false);
  const endpoint = '/api/camera/' + token;
  useEffect(() => {
    setReady(true);
    const leave = () => {
      generation.current++;
      cleanup.current();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (stream.current)
        navigator.sendBeacon(
          '/api/camera/' + token,
          new Blob([JSON.stringify({ action: 'stop' })], { type: 'application/json' }),
        );
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      cleanup.current();
      leave();
    };
  }, [token]);
  async function stop() {
    generation.current++;
    cleanup.current();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setActive(false);
    setLink('');
    setMessage('STOPPED · камера выключена');
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    }).catch(() => {});
  }
  async function start() {
    const run = ++generation.current;
    setBusy(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error('Для камеры нужен HTTPS или localhost');
      const local = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (run !== generation.current) {
        local.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = local;
      const consent = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'consent' }),
      });
      if (run !== generation.current) return;
      if (!consent.ok) throw new Error('Приглашение истекло');
      if (video.current) {
        video.current.srcObject = local;
        await video.current.play();
      }
      const config = await (await fetch('/api/rtc?token=' + token)).json();
      if (run !== generation.current) return;
      const peers = new Map<string, RTCPeerConnection>(),
        pending = new Map<string, RTCIceCandidateInit[]>();
      let closed = false,
        cursor = 0,
        timer: ReturnType<typeof setTimeout>,
        lastFrame = 0;
      cleanup.current = () => {
        closed = true;
        clearTimeout(timer);
        peers.forEach((p) => p.close());
        peers.clear();
        pending.clear();
        if (video.current) video.current.srcObject = null;
      };
      const signalUrl = '/api/camera-signal?token=' + token;
      const post = (peerId: string, payload: unknown) =>
        fetch(signalUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerId, payload }),
        });
      setActive(true);
      setMessage('ACTIVE · камера передаёт видео');
      const poll = async () => {
        if (closed) return;
        try {
          const state = await fetch(endpoint);
          if (!state.ok) throw new Error('STOPPED · сессия завершена администратором или истекла');
          const metadata = await state.json();
          const response = await fetch(signalUrl + '&after=' + cursor);
          if (!response.ok) throw new Error('DISCONNECTED · соединение потеряно');
          const { signals } = await response.json();
          if (closed) return;
          for (const s of signals) {
            cursor = Math.max(cursor, s.id);
            const p = s.payload;
            if (p.type === 'offer') {
              if (peers.size >= 4 && !peers.has(s.peerId)) continue;
              setLink(peers.size === 0 ? 'CONNECTING · подключается оператор' : '');
              peers.get(s.peerId)?.close();
              const pc = new RTCPeerConnection(config);
              peers.set(s.peerId, pc);
              pc.onconnectionstatechange = () => {
                if (closed) return;
                if (pc.connectionState === 'connected') setLink('LIVE · оператор подключён');
                else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')
                  setLink('DISCONNECTED · оператор отключился');
              };
              pc.onicecandidate = (e) => {
                if (e.candidate)
                  void post(s.peerId, { type: 'candidate', candidate: e.candidate.toJSON() }).catch(() => {});
              };
              local.getTracks().forEach((t) => pc.addTrack(t, local));
              await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
              for (const c of pending.get(s.peerId) || []) await pc.addIceCandidate(c);
              pending.delete(s.peerId);
              await pc.setLocalDescription(await pc.createAnswer());
              await post(s.peerId, { type: 'answer', sdp: pc.localDescription?.sdp });
            } else if (p.type === 'bye') {
              peers.get(s.peerId)?.close();
              peers.delete(s.peerId);
              pending.delete(s.peerId);
            } else if (p.type === 'candidate' && p.candidate) {
              const pc = peers.get(s.peerId);
              if (pc?.remoteDescription) await pc.addIceCandidate(p.candidate);
              else if (pending.size < 4 && (pending.get(s.peerId)?.length ?? 0) < 64)
                pending.set(s.peerId, [...(pending.get(s.peerId) || []), p.candidate]);
            }
          }
          if (metadata.cvEnabled && video.current?.videoWidth && Date.now() - lastFrame > 700) {
            lastFrame = Date.now();
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = Math.round((640 * video.current.videoHeight) / video.current.videoWidth);
            canvas.getContext('2d')?.drawImage(video.current, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, 'image/jpeg', 0.7),
            );
            if (blob) {
              const r = await fetch(endpoint + '/frame', {
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                body: blob,
              });
              const body = await r.json();
              setCv(body.message || 'CV: анализ последовательности');
            }
          } else if (!metadata.cvEnabled) setCv('CV не подключён. Передаётся только live video.');
        } catch (e) {
          if (closed) return;
          cleanup.current();
          local.getTracks().forEach((t) => t.stop());
          setActive(false);
          setLink('');
          setMessage(e instanceof Error ? e.message : 'DISCONNECTED · сессия завершена');
          return;
        }
        if (!closed) timer = setTimeout(poll, 700);
      };
      void poll();
    } catch (e) {
      if (run !== generation.current) return;
      cleanup.current();
      stream.current?.getTracks().forEach((t) => t.stop());
      setMessage(e instanceof Error ? e.message : 'Не удалось включить камеру');
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }
  return (
    <>
      <video ref={video} autoPlay playsInline muted className="camera-preview mt-5" />
      <p className={active ? 'camera-live' : 'subtle'} role="status" data-state={message.split(' ')[0]}>
        {message}
      </p>
      {link && (
        <p className="camera-live" role="status" data-state={link.split(' ')[0]}>
          {link}
        </p>
      )}
      <p className="subtle">{cv}</p>
      {active ? (
        <button className="button danger w-full" onClick={stop}>
          STOP CAMERA · Выключить камеру
        </button>
      ) : (
        <button className="button w-full mt-4" disabled={!ready || busy} onClick={start}>
          {busy ? 'Подключаем…' : 'Разрешить использовать мой телефон как demo camera'}
        </button>
      )}
      <p className="subtle mt-4">
        Закрытие страницы прекращает видеопередачу. Вы можете остановить камеру в любой момент.
      </p>
    </>
  );
}
