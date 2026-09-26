'use client';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ImageUp, Loader2, ScanSearch } from 'lucide-react';
import { severityLabel } from '@/lib/labels';
import type { RoadAnalyzeResult } from '@/lib/road';

type CameraOption = { id: string; name: string };

export default function RoadDetectionPanel({ cameras }: { cameras: CameraOption[] }) {
  const router = useRouter();
  const [state, setState] = useState<RoadAnalyzeResult>({});
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(file: File | undefined) {
    setPreview(file ? URL.createObjectURL(file) : null);
    setState({});
  }

  // Кадр можно перетащить прямо в область предпросмотра: он попадает в то же поле формы.
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = event.dataTransfer.files;
    if (!files.length || !files[0].type.startsWith('image/') || !input.current) return;
    input.current.files = files;
    pick(files[0]);
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setState({});
    try {
      const res = await fetch('/api/road/analyze', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as RoadAnalyzeResult;
      setState(res.ok || body.error ? body : { error: `Сервер ответил ошибкой ${res.status}` });
      // Очередь ниже обновляется отдельно; результат разбора уже на экране и от неё не зависит.
      if (res.ok && body.incidentId) router.refresh();
    } catch {
      setState({ error: 'Нет связи с сервером' });
    } finally {
      setPending(false);
    }
  }

  const detections = state.detections ?? [];
  const best = detections[0];

  return (
    <form onSubmit={analyze} className="panel road-panel" data-realtime-hold={preview ? '' : undefined}>
      <div className="panel-header">
        <div>
          <h2>Анализ кадра дорожной камеры</h2>
          <span>Кадр уходит в CV-сервис, найденное повреждение становится событием на карте</span>
        </div>
        <span className="badge status-new">Эвристика, не нейросеть</span>
      </div>
      <div className="panel-body road-panel-body">
        <div className="road-controls">
          <label className="field">Камера
            <select name="cameraId" required defaultValue={cameras[0]?.id}>
              {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">Кадр (JPG, PNG, WebP до 3 МБ)
            <input
              ref={input}
              id="road-frame-input"
              name="frame"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={event => pick(event.target.files?.[0])}
            />
          </label>
          <button className="button" type="submit" disabled={pending || !preview}>
            {pending ? <Loader2 size={16} className="spin" /> : <ScanSearch size={16} />}
            {pending ? 'Анализ кадра…' : 'Проанализировать кадр'}
          </button>
          <p className="subtle">
            Детектор ищет в нижней части кадра компактные тёмные области с резкой границей. Тени и мокрый
            асфальт дают ложные срабатывания — поэтому каждое обнаружение проверяет оператор.
          </p>
        </div>

        <div
          className={`road-frame ${dragging ? 'dragging' : ''}`}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          {preview ? (
            <div className="road-frame-image">
              <Image src={preview} alt="Кадр дорожной камеры" width={0} height={0} sizes="(max-width: 900px) 100vw, 60vw" unoptimized style={{ width: '100%', height: 'auto' }} />
              {!pending && detections.map((d, n) => (
                <span
                  key={n}
                  className={`road-box sev-${d.severity.toLowerCase()}`}
                  style={{ left: `${d.bbox[0] * 100}%`, top: `${d.bbox[1] * 100}%`, width: `${d.bbox[2] * 100}%`, height: `${d.bbox[3] * 100}%` }}
                >
                  <b>{Math.round(d.score)}%</b>
                </span>
              ))}
              {pending && <span className="scan-beam" />}
            </div>
          ) : (
            <label htmlFor="road-frame-input" className="road-frame-empty">
              <ImageUp size={30} />
              <strong>Перетащите кадр сюда</strong>
              <span>или нажмите, чтобы выбрать файл</span>
            </label>
          )}

          {state.error && <p className="error-banner" role="alert">{state.error}</p>}
          {state.analyzed && !pending && detections.length === 0 && (
            <p className="subtle road-result">Повреждений не найдено на кадре камеры {state.cameraName}.</p>
          )}
          {best && !pending && state.incidentId && (
            <div className="road-result">
              <strong>{state.linked ? 'Добавлено к уже открытой проблеме' : 'Создано событие: ожидает проверки'}</strong>
              <p>Обнаружено у камеры {state.cameraName} · оценка детектора {Math.round(best.score)}% · {severityLabel[best.severity]} (по площади в кадре)</p>
              <Link href={`/incidents/${state.incidentId}`} className="text-link">Проверить и подтвердить <ArrowUpRight size={15} /></Link>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
