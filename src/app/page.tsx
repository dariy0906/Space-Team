import Link from 'next/link';
import { ArrowRight, ListChecks, LayoutDashboard, ScanLine, ShieldCheck, Waves } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { PIPE_NETWORK } from '@/lib/pipe-network';
import { LAW_ARTICLES } from '@/lib/antifraud/laws';
import { Glyph } from '@/components/icons';
import CityIllustration from '@/components/city-illustration';

export const dynamic = 'force-dynamic';

const features = [
  {
    icon: LayoutDashboard,
    title: 'Карта города',
    text: 'События от камер, датчиков и дронов на одной карте. Кластеры, тепловая карта нагрузки, маршрут до работника и карточка происшествия в один клик.',
    glyphs: ['flame', 'droplets', 'triangle-alert', 'waves'] as const,
  },
  {
    icon: Waves,
    title: 'Карта труб',
    text: 'Схема водопровода Актау с состоянием каждого участка: диаметр, материал, год прокладки и износ. Видно, что менять в первую очередь.',
    glyphs: ['droplets', 'circle-dot'] as const,
  },
  {
    icon: ScanLine,
    title: 'Антифрод-помощник',
    text: 'Проверка SMS, писем и договоров на мошеннические схемы. Работает прямо в браузере, текст никуда не отправляется.',
    glyphs: ['mail', 'circle-alert'] as const,
  },
];

const roles = [
  { icon: LayoutDashboard, title: 'Оператор', text: 'Видит сводку по городу, подтверждает события и назначает работников.' },
  { icon: ListChecks, title: 'Работник', text: 'Получает задачу, ведёт её по статусам и закрывает с результатом.' },
  { icon: ShieldCheck, title: 'Житель', text: 'Сообщает о проблеме с точкой на карте и следит за ходом решения.' },
];

export default async function Landing() {
  const user = await currentUser();
  const target = user ? `/${user.role.toLowerCase()}` : '/login';
  const criticalPipes = PIPE_NETWORK.filter(pipe => pipe.condition === 'critical').length;

  const stats = [
    { value: String(PIPE_NETWORK.length), label: 'участков водопровода на схеме' },
    { value: String(criticalPipes), label: 'из них в аварийном состоянии' },
    { value: String(LAW_ARTICLES.length), label: 'статей УК и КоАП в антифроде' },
    { value: '3', label: 'роли: оператор, работник, житель' },
  ];

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden="true" />

      <header className="landing-nav">
        <div className="landing-brand">
          <span className="brand-mark"><ShieldCheck size={22} /></span>
          <div>
            <strong>SU AQTAU</strong>
            <small>SAFE CITY SYSTEM</small>
          </div>
        </div>
        <Link href={target} className="button landing-nav-cta">
          {user ? 'В панель' : 'Войти'} <ArrowRight size={15} />
        </Link>
      </header>

      <section className="landing-hero">
        <span className="landing-pill"><i className="live-dot" />Демонстрационная платформа · Актау</span>
        <h1>Город под контролем.<br />Помощь рядом.</h1>
        <p>
          Единая платформа для жителей, городских служб и операторов: события на карте,
          состояние водопроводной сети и защита горожан от мошенников.
        </p>
        <div className="landing-actions">
          <Link href={target} className="button landing-cta">
            Начать <ArrowRight size={17} />
          </Link>
          <a href="#features" className="button secondary">Что внутри</a>
        </div>
        <p className="landing-note">Вход по демо-ролям — пароль вводить не нужно.</p>
        <CityIllustration />
      </section>

      <section className="landing-stats">
        {stats.map(item => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className="landing-features" id="features">
        {features.map(feature => (
          <article key={feature.title}>
            <span className="landing-feature-icon"><feature.icon size={21} /></span>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
            <div className="landing-feature-glyphs">
              {feature.glyphs.map(name => <Glyph key={name} name={name} size={17} animate />)}
            </div>
          </article>
        ))}
      </section>

      <section className="landing-roles">
        <h2>Три роли — один город</h2>
        <div>
          {roles.map(role => (
            <article key={role.title}>
              <span><role.icon size={18} /></span>
              <div>
                <strong>{role.title}</strong>
                <p>{role.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <h2>Посмотрите, как это работает</h2>
        <p>Демо-данные уже загружены: события, работники, схема сети и примеры для антифрод-проверки.</p>
        <Link href={target} className="button landing-cta">
          Начать <ArrowRight size={17} />
        </Link>
      </section>

      <footer className="landing-footer">
        SU AQTAU — демонстрационный MVP. События имитируются, интеграций с городскими службами нет.
      </footer>
    </div>
  );
}
