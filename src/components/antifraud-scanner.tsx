'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSearch, Loader2, Phone, Link2, CreditCard, ScanLine, ShieldAlert, ShieldCheck, Trash2, Scale } from 'lucide-react';
import { analyzeText, categoryLabel, maskCard, MAX_INPUT_LENGTH, type AntifraudResult, type Verdict } from '@/lib/antifraud/engine';
import type { LawCountry } from '@/lib/antifraud/laws';

const verdictStyle: Record<Verdict, { tone: string; icon: typeof ShieldCheck; caption: string }> = {
  'МОШЕННИКИ': { tone: 'danger', icon: ShieldAlert, caption: 'Обнаружена мошенническая схема' },
  'ПОДОЗРИТЕЛЬНО': { tone: 'warn', icon: AlertTriangle, caption: 'Требуется осторожность' },
  'БЕЗОПАСНО': { tone: 'safe', icon: ShieldCheck, caption: 'Явных угроз не найдено' },
};

const severityTone: Record<string, string> = { critical: 'danger', explicit: 'danger', suspicious: 'warn', weak: 'muted' };
const severityLabel: Record<string, string> = { critical: 'Критично', explicit: 'Явный признак', suspicious: 'Подозрительно', weak: 'Слабый сигнал' };

const SAMPLES: { label: string; text: string }[] = [
  { label: 'Звонок «из банка»', text: 'Здравствуйте, вас беспокоит служба безопасности банка. На ваш счёт пытались оформить кредит. Срочно назовите код из SMS, который мы вам отправили, иначе карта будет заблокирована. Никому не говорите об этой проверке.' },
  { label: 'Фишинговая ссылка', text: 'Ваша посылка не доставлена. Оплатите таможенный сбор в течение 24 часов по ссылке http://kaspi-dostavka.top/pay и подтвердите данные карты.' },
  { label: 'Обычное сообщение', text: 'Привет! Завтра в 18:00 встречаемся у второго подъезда, я принесу документы по квартире. Если опоздаю — напиши.' },
];

function RiskGauge({ score, tone }: { score: number; tone: string }) {
  const radius = 54;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  return (
    <div className={`risk-gauge tone-${tone}`}>
      <svg viewBox="0 0 140 82" role="img" aria-label={`Уровень риска ${score} из 100`}>
        <path d="M 16 74 A 54 54 0 0 1 124 74" fill="none" stroke="var(--line)" strokeWidth="12" strokeLinecap="round" />
        <path d="M 16 74 A 54 54 0 0 1 124 74" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="risk-gauge-arc" />
      </svg>
      <div className="risk-gauge-value"><strong>{score}</strong><span>из 100</span></div>
    </div>
  );
}

export default function AntifraudScanner() {
  const [text, setText] = useState('');
  const [country, setCountry] = useState<LawCountry>('KZ');
  const [result, setResult] = useState<AntifraudResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setScanning(false);
    setResult(null);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text, country]);

  const grouped = useMemo(() => {
    if (!result) return [];
    const byCategory = new Map<string, typeof result.signals>();
    for (const signal of result.signals) {
      const list = byCategory.get(signal.category) ?? [];
      list.push(signal);
      byCategory.set(signal.category, list);
    }
    return [...byCategory.entries()];
  }, [result]);

  function scan(value = text) {
    const trimmed = value.trim();
    if (!trimmed || scanning) return;
    setScanning(true);
    setResult(null);
    // Анализ мгновенный и локальный; короткая пауза нужна только чтобы показать индикатор сканирования.
    timer.current = setTimeout(() => {
      setResult(analyzeText(trimmed, country));
      setScanning(false);
    }, 550);
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setText('');
    setResult(null);
    setScanning(false);
  }

  const style = result ? verdictStyle[result.verdict] : null;
  const VerdictIcon = style?.icon ?? ShieldCheck;

  return (
    <div className="antifraud">
      <section className="panel antifraud-input">
        <div className="panel-header">
          <div>
            <h2>Проверка сообщения</h2>
            <span>Вставьте SMS, письмо, текст договора или переписку</span>
          </div>
          <div className="segmented" role="group" aria-label="Юрисдикция">
            {(['KZ', 'RU'] as LawCountry[]).map(code => (
              <button key={code} type="button" className={country === code ? 'on' : ''} onClick={() => { setCountry(code); setResult(null); }}>
                {code === 'KZ' ? 'Казахстан' : 'Россия'}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body">
          <div className={`scan-field ${scanning ? 'scanning' : ''}`}>
            <textarea
              value={text}
              maxLength={MAX_INPUT_LENGTH}
              onChange={event => setText(event.target.value)}
              placeholder="Например: «Вас беспокоит служба безопасности банка, назовите код из SMS…»"
              aria-label="Текст для проверки"
            />
            {scanning && <span className="scan-beam" />}
          </div>
          <div className="scan-meta">
            <span className="subtle">{text.length} / {MAX_INPUT_LENGTH} символов</span>
            <span className="subtle">Анализ выполняется в браузере — текст никуда не отправляется</span>
          </div>
          <div className="scan-samples">
            <span className="subtle">Примеры:</span>
            {SAMPLES.map(sample => (
              <button key={sample.label} type="button" className="chip" onClick={() => { setText(sample.text); setResult(null); }}>{sample.label}</button>
            ))}
          </div>
          <div className="actions-row">
            <button className="button" type="button" onClick={() => scan()} disabled={!text.trim() || scanning}>
              {scanning ? <Loader2 size={16} className="spin" /> : <ScanLine size={16} />}
              {scanning ? 'Сканирование…' : 'Проверить'}
            </button>
            <button className="button secondary" type="button" onClick={reset} disabled={!text && !result}><Trash2 size={15} /> Очистить</button>
          </div>
        </div>
      </section>

      {result && style && (
        <section className={`panel antifraud-result tone-${style.tone}`}>
          <div className="verdict-head">
            <RiskGauge score={result.riskScore} tone={style.tone} />
            <div className="verdict-text">
              <span className={`badge verdict-badge tone-${style.tone}`}><VerdictIcon size={14} /> {result.verdict}</span>
              <h2>{style.caption}</h2>
              <p>{result.explanation}</p>
            </div>
          </div>

          <div className="verdict-advice">
            <strong>Что делать</strong>
            <p>{result.instructions}</p>
          </div>

          {(result.sanitized || result.truncated) && (
            <p className="subtle panel-note">
              {result.sanitized && 'Из текста удалены попытки подменить инструкции анализатора. '}
              {result.truncated && `Текст обрезан до ${MAX_INPUT_LENGTH} символов.`}
            </p>
          )}

          {result.signals.length > 0 && (
            <div className="signal-groups">
              <h3><FileSearch size={15} /> Найденные признаки ({result.signals.length})</h3>
              {grouped.map(([category, signals]) => (
                <div className="signal-group" key={category}>
                  <span className="signal-group-title">{categoryLabel[category as keyof typeof categoryLabel]}</span>
                  {signals.map(signal => (
                    <div className={`signal tone-${severityTone[signal.severity]}`} key={signal.id}>
                      <div className="signal-top">
                        <strong>{signal.label}</strong>
                        <span className="badge">{severityLabel[signal.severity]}</span>
                      </div>
                      {signal.matches.length > 0 && (
                        <div className="signal-matches">{signal.matches.map(match => <code key={match}>{match}</code>)}</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {(result.entities.urls.length > 0 || result.entities.phones.length > 0 || result.entities.cards.length > 0) && (
            <div className="entity-grid">
              {result.entities.urls.length > 0 && (
                <div className="entity"><span><Link2 size={14} /> Ссылки</span>{result.entities.urls.slice(0, 6).map(url => <code key={url}>{url}</code>)}</div>
              )}
              {result.entities.phones.length > 0 && (
                <div className="entity"><span><Phone size={14} /> Телефоны</span>{result.entities.phones.map(phone => <code key={phone}>{phone}</code>)}</div>
              )}
              {result.entities.cards.length > 0 && (
                <div className="entity"><span><CreditCard size={14} /> Номера карт</span>{result.entities.cards.map(card => <code key={card}>{maskCard(card)}</code>)}</div>
              )}
            </div>
          )}

          {result.articles.length > 0 && (
            <div className="law-list">
              <h3><Scale size={15} /> Правовая квалификация</h3>
              {result.articles.map(article => (
                <article className={`law-card ${article.article === result.detectedArticle ? 'primary' : ''}`} key={article.article}>
                  <div className="law-card-top">
                    <strong>{article.article}</strong>
                    <span className="badge">{article.kind === 'criminal' ? 'Уголовный кодекс' : 'Административный кодекс'}</span>
                  </div>
                  <b>{article.title}</b>
                  <p>{article.text}</p>
                  <small>Санкции: {article.sanctions}</small>
                </article>
              ))}
            </div>
          )}

          <p className="subtle panel-note">
            Вердикт получен локальным движком правил (порт QuickCheck) без обращения к ИИ-модели. Подключение модели добавит развёрнутое объяснение, но не требуется для работы проверки. Результат носит справочный характер и не заменяет обращение в банк или полицию.
          </p>
        </section>
      )}
    </div>
  );
}
