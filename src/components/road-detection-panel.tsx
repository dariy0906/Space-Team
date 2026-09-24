'use client';
import { useActionState, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ImageUp, Loader2, ScanSearch } from 'lucide-react';
import { analyzeRoadFrameAction, type RoadActionState } from '@/app/road-actions';
import { severityLabel } from '@/lib/labels';

type CameraOption = { id: string; name: string };

export default function RoadDetectionPanel({ cameras }: { cameras: CameraOption[] }) {
  const [state, action, pending] = useActionState<RoadActionState, FormData>(analyzeRoadFrameAction, {});
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const detections = state.detections ?? [];
  const best = detections[0];

  return (
    <form action={action} className="panel road-panel" data-realtime-hold={preview ? '' : undefined}>
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
              name="frame"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={event => {
                const file = event.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
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

        <div className="road-frame">
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
            <div className="road-frame-empty"><ImageUp size={28} /><span>Выберите кадр с камеры</span></div>
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
