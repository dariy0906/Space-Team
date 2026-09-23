import { redirect } from 'next/navigation';
import { ArrowRight, HardHat, MapPin, ShieldCheck } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { loginAction, quickLoginAction } from '../actions';

const demoRoles = [
  { role: 'OPERATOR', label: 'Оператор', detail: 'Карта и управление событиями', Icon: ShieldCheck },
  { role: 'WORKER', label: 'Работник', detail: 'Задачи и маршрут', Icon: HardHat },
  { role: 'RESIDENT', label: 'Житель', detail: 'Карта и обращения', Icon: MapPin },
] as const;

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (user) redirect(`/${user.role.toLowerCase()}`);
  const { error } = await searchParams;
  const showQuickLogin = process.env.NODE_ENV === 'development';

  return <div className="login-page">
    <div className="login-art">
      <div className="flex items-center gap-3 font-extrabold tracking-widest"><ShieldCheck size={30}/> SU AQTAU</div>
      <h1>Город под контролем. Помощь рядом.</h1>
      <p>Единая цифровая платформа для жителей, городских служб и операторов Актау.</p>
      <div className="mt-8 text-xs text-cyan-200 flex items-center gap-2"><i className="live-dot"/>ДЕМОНСТРАЦИОННАЯ СИСТЕМА</div>
    </div>
    <div className="login-form-side"><div className="login-box">
      <span className="text-cyan-600"><ShieldCheck size={30}/></span>
      <h2>Добро пожаловать</h2>
      <p className="subtle">Войдите, чтобы продолжить работу</p>
      {error && <p className="toast" style={{ background:'#ffe9e9', color:'#a43d4c' }}>
        {error === 'demo' ? 'Демо-аккаунт не найден. Проверьте загрузку seed.' : 'Неверный email или пароль'}
      </p>}

      {showQuickLogin && <section className="demo-fast-login" aria-label="Быстрый демо-вход">
        <strong>Быстрый демо-вход</strong>
        <p>Выберите роль — логин и пароль вводить не нужно.</p>
        <form action={quickLoginAction} className="quick-login-form">
          {demoRoles.map(({ role, label, detail, Icon }) => <button key={role} type="submit" name="role" value={role} className="quick-login-button">
            <span className="quick-login-icon"><Icon size={18}/></span>
            <span><b>{label}</b><small>{detail}</small></span>
            <ArrowRight size={16} className="ml-auto text-slate-400"/>
          </button>)}
        </form>
      </section>}

      <div className="login-divider"><span>или войдите по паролю</span></div>
      <form action={loginAction} className="password-login-form">
        <label className="field">Email<input name="email" type="email" required placeholder="operator@demo.kz" /></label>
        <label className="field">Пароль<input name="password" type="password" required placeholder="Ваш демо-пароль" /></label>
        <button className="button w-full" type="submit">Войти <ArrowRight size={16}/></button>
      </form>
      <div className="demo-accounts">Демо-пароль хранится в <code>.env</code> и задаётся через <code>DEMO_PASSWORD</code>.</div>
    </div></div>
  </div>;
}
