import {redirect} from 'next/navigation';
import {ShieldCheck} from 'lucide-react';
import {currentUser} from '@/lib/auth';
import {demoAccounts,demoEnabled} from '@/lib/demo';
import {loginAction,quickLoginAction} from '../actions';
import SubmitButton from '@/components/submit-button';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const user=await currentUser();if(user)redirect('/'+user.role.toLowerCase());const {error}=await searchParams;
 const roles={OPERATOR:'Диспетчеры',ADMIN:'Администратор',RESIDENT:'Жители',WORKER:'Городские службы'};
 return <div className="login-page"><div className="login-art"><div className="flex items-center gap-3 font-extrabold tracking-widest"><ShieldCheck/> SU AQTAU</div><h1>Город под контролем.<br/>Помощь рядом.</h1><p>Единая диспетчерская Актау. От обращения жителя до подтверждённого результата.</p><div className="mt-8 text-xs text-cyan-200">SMART CITY AKTAU · HACKATHON MVP</div></div><div className="login-form-side"><div className="login-box"><p className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</p><h2>Выберите рабочее место</h2>{error&&<p className="error-banner">{error==='demo'?'Загрузите демо-аккаунты командой db:seed':'Неверный email или пароль'}</p>}{demoEnabled()&&<section className="demo-fast-login"><p>Демонстрационные аккаунты · вход без пароля</p>{Object.entries(roles).map(([role,label])=><details key={role} open={role==='OPERATOR'} className="demo-role-group"><summary>{label}</summary><form action={quickLoginAction} className="quick-login-form">{demoAccounts.filter(a=>a.role===role).map(a=><button name="email" value={a.email} className="quick-login-button" key={a.email}><span><b>{a.name}</b><small>{a.email}</small></span><span className="ml-auto">→</span></button>)}</form></details>)}</section>}<details className="mt-5"><summary className="subtle cursor-pointer">Войти по email и паролю</summary><form action={loginAction}><label className="field">Email<input name="email" type="email" required autoComplete="username"/></label><label className="field">Пароль<input name="password" type="password" required autoComplete="current-password"/></label><SubmitButton>Войти</SubmitButton></form></details></div></div></div>;
}

