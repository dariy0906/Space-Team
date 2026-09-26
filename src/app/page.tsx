import Link from 'next/link';
import type { ComponentType, CSSProperties } from 'react';
import {
  ArrowRight, Cctv, CheckCircle2, Construction, Droplets, Gauge, HardHat, KeyRound, Layers, Map as MapIcon,
  Megaphone, RadioTower, Route, ScanLine, School, ShieldCheck, Sparkles, UserCog, Users, Wind,
} from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { PIPE_NETWORK } from '@/lib/pipe-network';
import { LAW_ARTICLES } from '@/lib/antifraud/laws';
import { airSnapshot } from '@/lib/air-monitor';
import { landingMap } from '@/lib/landing-map';
import CityScheme from '@/components/landing/city-scheme';
import CountUp from '@/components/landing/count-up';
import LandingMotion from '@/components/landing/landing-motion';
import { AirVisual, CameraVisual, DispatchVisual, FraudVisual, LayersVisual, ReportVisual, RoadVisual, WaterVisual } from '@/components/landing/visuals';

export const dynamic = 'force-dynamic';

type Icon = ComponentType<{ size?: number }>;
const d = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

const marquee: { icon: Icon; label: string }[] = [
  { icon: MapIcon, label: 'Карта города' },
  { icon: Construction, label: 'Ямы и дороги' },
  { icon: Droplets, label: 'Отключения воды' },
  { icon: Gauge, label: 'Качество воздуха' },
  { icon: School, label: 'Школы и больницы' },
  { icon: ScanLine, label: 'Антифрод с ИИ' },
  { icon: HardHat, label: 'Городские бригады' },
  { icon: Route, label: 'Маршруты и ETA' },
  { icon: Megaphone, label: 'Обращения жителей' },
  { icon: Cctv, label: 'Камеры по согласию' },
];

const steps: { icon: Icon; title: string; text: string }[] = [
  { icon: RadioTower, title: 'Сигнал', text: 'Житель, дорожная камера или датчик сообщает о проблеме' },
  { icon: ShieldCheck, title: 'Проверка', text: 'Оператор подтверждает событие, дубли объединяются сами' },
  { icon: Users, title: 'Назначение', text: 'Система предлагает бригаду по специализации и загрузке' },
  { icon: Route, title: 'Выезд', text: 'Маршрут по реальным дорогам, ETA и статусы в реальном времени' },
  { icon: CheckCircle2, title: 'Результат', text: 'Фото «после», история работ и уведомление жителю' },
];

const roles: { icon: Icon; title: string; points: string[] }[] = [
  { icon: Megaphone, title: 'Житель', points: ['Сообщает о проблеме с фото и точкой на карте', 'Видит предупреждения о воде и воздухе', 'Проверяет подозрительные сообщения'] },
  { icon: MapIcon, title: 'Оператор', points: ['Видит все слои города на одной карте', 'Подтверждает события и назначает бригады', 'Разбирает кадры дорожных камер'] },
  { icon: HardHat, title: 'Бригада', points: ['Получает задачи в порядке очереди', 'Едет по маршруту с ETA', 'Закрывает работу фото результата'] },
  { icon: UserCog, title: 'Администратор', points: ['Управляет пользователями и сменами', 'Приглашает камеры по QR и email', 'Может остановить любую камеру'] },
];

const honesty = [
  { tag: 'LIVE', tone: 'live', text: 'Реальные внешние данные: модель качества воздуха CAMS и ветер (Open-Meteo), школы и больницы из OpenStreetMap, маршруты OSRM, ответы Google Gemini.' },
  { tag: 'SIMULATED', tone: 'sim', text: 'Смоделированные показания демо-станций AQ-01…03 — для сценария «загрязнение у школ». В интерфейсе подписаны.' },
  { tag: 'DEMO DATA', tone: 'demo', text: 'Демонстрационное размещение дорожных камер, отключения воды и стартовые события, чтобы было что показать.' },
  { tag: 'EXPERIMENTAL', tone: 'exp', text: 'Эвристики, а не обученные нейросети: детекторы ям и падения. Решение всегда принимает оператор.' },
];

const stack = ['Next.js 15', 'React 19', 'PostgreSQL', 'Prisma', 'MapLibre GL', 'OpenStreetMap', 'Open-Meteo · CAMS', 'Google Gemini', 'MediaPipe', 'OSRM', 'Server-Sent Events', 'Docker'];

export default async function Landing() {
  const [user, facilities, cameras, air] = await Promise.all([
    currentUser(),
    db.cityFacility.count().catch(() => 0),
    db.camera.count({ where: { name: { startsWith: 'AKT-' } } }).catch(() => 0),
    airSnapshot().catch(() => []),
  ]);
  const target = user ? `/${user.role.toLowerCase()}` : '/login';
  const live = air.find(station => station.dataKind === 'LIVE') ?? null;
  const criticalPipes = PIPE_NETWORK.filter(pipe => pipe.condition === 'critical').length;
  const map = landingMap(560);

  const stats = [
    { value: facilities, label: 'школ, садов и больниц', note: 'из OpenStreetMap' },
    { value: PIPE_NETWORK.length, label: 'участков водопровода', note: `${criticalPipes} аварийных` },
    { value: cameras, label: 'дорожных камер', note: 'демо-размещение' },
    { value: LAW_ARTICLES.length, label: 'статей УК и КоАП', note: 'РК и РФ в антифроде' },
  ];

  const modules: { visual: ComponentType; tag: string; tone: string; title: string; text: string; facts: string[]; wide?: boolean }[] = [
    {
      visual: LayersVisual, tag: 'Оператор и житель', tone: 'brand', wide: true,
      title: 'Единая карта города',
      text: 'Критические события, ямы, обращения, отключения воды, качество воздуха, школы и больницы, камеры и бригады. Слои включаются одним нажатием, карточка объекта открывается рядом с картой.',
      facts: ['9 слоёв', `${facilities} объектов OSM`, 'кластеры и тепловая карта'],
    },
    {
      visual: FraudVisual, tag: 'Gemini + правила', tone: 'violet',
      title: 'Антифрод с ИИ',
      text: 'Локальные правила и Google Gemini независимо оценивают SMS, письмо или договор, находят приёмы давления и подбирают статью закона.',
      facts: [`${LAW_ARTICLES.length} статьи РК и РФ`, 'карты и ИИН маскируются'],
    },
    {
      visual: RoadVisual, tag: 'Experimental', tone: 'amber',
      title: 'Ямы с дорожных камер',
      text: 'CV-детектор находит повреждение на кадре: рамка, оценка и место камеры попадают в событие «ожидает проверки».',
      facts: [`${cameras} камер`, 'без дублей в 30 м'],
    },
    {
      visual: WaterVisual, tag: 'Вода', tone: 'blue',
      title: 'Отключения воды',
      text: 'Зона, стадия работ, причина и срок восстановления. Сразу видно, какие школы, сады и больницы остались без воды.',
      facts: [`${PIPE_NETWORK.length} участков сети`, `${criticalPipes} аварийных`],
    },
    {
      visual: AirVisual, tag: live ? 'Live' : 'Воздух', tone: 'green',
      title: 'Воздух и ветер',
      text: 'AQI по PM2.5, PM10 и NO₂, ветер и оценка зоны переноса. Если в зону попадают школы, жители получают предупреждение.',
      facts: live ? [`AQI сейчас ${live.aqi}`, live.category.label.toLowerCase()] : ['обновление раз в 15 минут', 'шкала US EPA'],
    },
    {
      visual: ReportVisual, tag: 'Жителям', tone: 'brand',
      title: 'Обращения за минуту',
      text: 'Фото, точка на карте и категория. Житель видит ход решения и фото «после», а чужие обращения и кадры камер ему не показываются.',
      facts: ['статусы в реальном времени', 'приватность по умолчанию'],
    },
    {
      visual: DispatchVisual, tag: 'Службы', tone: 'teal',
      title: 'Бригады и маршруты',
      text: 'Исполнитель подбирается по специализации и загрузке, маршрут и ETA считаются по реальным дорогам через OSRM.',
      facts: ['очередь задач', 'фото до и после'],
    },
    {
      visual: CameraVisual, tag: 'Experimental', tone: 'rose',
      title: 'Камера по согласию',
      text: 'Житель может добровольно подключить камеру телефона. Остановить трансляцию может владелец или администратор, оператор её не включает.',
      facts: ['WebRTC', 'детектор падения'],
    },
  ];

  return (
    <div className="landing">
      <LandingMotion />

      <header className="lnav">
        <Link href="/" className="lnav-brand" aria-label="DigitalAqtau — на главную">
          <span className="lnav-mark"><ShieldCheck size={20} /></span>
          <span>Digital<b>Aqtau</b></span>
        </Link>
        <nav className="lnav-links" aria-label="Разделы">
          <a href="#modules">Возможности</a>
          <a href="#how">Как работает</a>
          <a href="#data">Данные</a>
        </nav>
        <Link href={target} className="lbtn lbtn-light lnav-cta">{user ? 'В панель' : 'Войти'} <ArrowRight size={15} /></Link>
      </header>

      <section className="lhero">
        <div className="lhero-bg" aria-hidden="true"><i className="orb a" /><i className="orb b" /><i className="orb c" /><i className="grid" /></div>
        <div className="lhero-inner">
          <div className="lhero-copy">
            <span className="lpill"><i className="lpill-dot" /> Цифровая платформа города Актау</span>
            <h1>
              <span className="line" style={d(80)}>Весь Актау —</span>
              <span className="line accent" style={d(200)}>на одном экране</span>
            </h1>
            <p style={d(320)}>
              DigitalAqtau объединяет обращения жителей, дорожные камеры, водопровод, качество воздуха
              и городские бригады. Оператор видит проблему и отправляет помощь, житель видит результат.
            </p>
            <div className="lhero-actions" style={d(440)}>
              <Link href={target} className="lbtn lbtn-primary">Начать <ArrowRight size={17} /></Link>
              <a href="#modules" className="lbtn lbtn-ghost">Смотреть возможности</a>
            </div>
            <ul className="lhero-trust" style={d(560)}>
              <li><KeyRound size={14} /> Вход по демо-ролям без пароля</li>
              <li><Layers size={14} /> Данные OpenStreetMap и Open-Meteo</li>
              <li><Sparkles size={14} /> ИИ Google Gemini</li>
            </ul>
          </div>

          <div className="lhero-visual">
            <div className="scheme-frame">
              <span className="radar" aria-hidden="true" />
              <CityScheme map={map} />
            </div>
            <div className="fcard f1">
              <span className="fcard-icon amber"><Construction size={16} /></span>
              <div><strong>Яма на дороге</strong><small>Камера AKT-014 · оценка 98%</small></div>
              <em className="fcard-tag amber">проверка</em>
            </div>
            <div className="fcard f2">
              <span className="fcard-icon green"><Wind size={16} /></span>
              {live
                ? <div><strong>AQI {live.aqi} · {live.category.label.toLowerCase()}</strong><small>Модель CAMS · обновлено сейчас</small></div>
                : <div><strong>Качество воздуха</strong><small>AQI по PM2.5 · шкала EPA</small></div>}
              <em className="fcard-tag green">{live ? 'live' : 'air'}</em>
            </div>
            <div className="fcard f3">
              <span className="fcard-icon violet"><Sparkles size={16} /></span>
              <div><strong>Gemini: мошенничество</strong><small>риск 95 · ст. 190 УК РК</small></div>
            </div>
            <div className="fcard f4">
              <span className="fcard-icon teal"><HardHat size={16} /></span>
              <div><strong>Бригада в пути</strong><small>маршрут OSRM · ETA 12 мин</small></div>
            </div>
            <p className="lhero-caption">Реальная схема водопровода Актау · точки — аварийные участки · карточки — примеры событий</p>
          </div>
        </div>
      </section>

      <div className="lmarquee" aria-label="Модули платформы">
        <div className="lmarquee-track">
          {[0, 1].map(copy => (
            <ul key={copy} aria-hidden={copy === 1 || undefined}>
              {marquee.map(item => <li key={item.label}><item.icon size={16} /> {item.label}</li>)}
            </ul>
          ))}
        </div>
      </div>

      <section className="lstats">
        {stats.map((item, i) => (
          <div key={item.label} data-reveal style={d(i * 90)}>
            <strong><CountUp value={item.value} /></strong>
            <span>{item.label}</span>
            <small>{item.note}</small>
          </div>
        ))}
      </section>

      <section className="lsection" id="modules">
        <div className="lsection-head" data-reveal>
          <span className="leyebrow">Возможности</span>
          <h2>Всё, чем живёт город, — в одной системе</h2>
          <p>Восемь модулей работают на общих данных: событие с камеры, жалоба жителя и отключение воды попадают на одну карту и в один процесс.</p>
        </div>
        <div className="lbento">
          {modules.map((m, i) => (
            <article key={m.title} className={`lcard t-${m.tone} ${m.wide ? 'wide' : ''}`} data-reveal data-glow style={d((i % 3) * 90)}>
              <div className="lcard-visual"><m.visual /></div>
              <div className="lcard-body">
                <span className="lcard-tag">{m.tag}</span>
                <h3>{m.title}</h3>
                <p>{m.text}</p>
                <ul className="lcard-facts">{m.facts.map(f => <li key={f}>{f}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lsection" id="how">
        <div className="lsection-head" data-reveal>
          <span className="leyebrow">Как это работает</span>
          <h2>От сигнала до результата — пять шагов</h2>
          <p>Каждый шаг виден всем участникам без обновления страницы: события приходят через SSE.</p>
        </div>
        <ol className="lsteps" data-reveal>
          {steps.map((step, i) => (
            <li key={step.title} style={d(i * 140)}>
              <span className="lstep-icon"><step.icon size={20} /></span>
              <span className="lstep-num">0{i + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lsection">
        <div className="lsection-head" data-reveal>
          <span className="leyebrow">Роли</span>
          <h2>Четыре роли — один город</h2>
        </div>
        <div className="lroles">
          {roles.map((role, i) => (
            <article key={role.title} data-reveal data-glow style={d(i * 90)}>
              <span className="lrole-icon"><role.icon size={20} /></span>
              <h3>{role.title}</h3>
              <ul>{role.points.map(point => <li key={point}><CheckCircle2 size={14} /> {point}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="lsection" id="data">
        <div className="lsection-head" data-reveal>
          <span className="leyebrow">Честно о данных</span>
          <h2>Мы подписываем, что реально, а что — демо</h2>
          <p>Каждое значение в интерфейсе помечено источником. Никакой «имитации ИИ» и выдуманных показаний под видом настоящих.</p>
        </div>
        <div className="lhonesty">
          {honesty.map((item, i) => (
            <div key={item.tag} className={`lhonest ${item.tone}`} data-reveal style={d(i * 90)}>
              <span className="lhonest-tag"><i /> {item.tag}</span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <ul className="lstack" data-reveal>
          {stack.map(tech => <li key={tech}>{tech}</li>)}
        </ul>
      </section>

      <section className="lfinal" data-reveal>
        <span className="lfinal-rings" aria-hidden="true"><i /><i /><i /></span>
        <h2>Посмотрите город в действии</h2>
        <p>Демо-данные уже загружены: события, камеры, отключения воды, воздух и примеры для антифрода. Выберите роль — пароль не нужен.</p>
        <Link href={target} className="lbtn lbtn-light lbtn-big">Начать <ArrowRight size={18} /></Link>
      </section>

      <footer className="lfooter">
        <span className="lnav-brand"><span className="lnav-mark"><ShieldCheck size={16} /></span><span>Digital<b>Aqtau</b></span></span>
        <p>Демонстрационный MVP хакатона. Интеграций с городскими службами нет; данные в интерфейсе помечены LIVE, SIMULATED или DEMO.</p>
      </footer>
    </div>
  );
}
