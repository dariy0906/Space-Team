import SettingsControls from '@/components/settings-controls';
import { requireUser } from '@/lib/auth';
export default async function Settings() { const user = await requireUser(); return <><div className="page-heading"><div><p className="eyebrow">ПРОФИЛЬ</p><h1>Настройки</h1><p className="subtle">Интерфейс, приватность и мобильная версия</p></div></div><div className="panel panel-body mb-4"><h2 className="font-extrabold mb-2">{user.name}</h2><p className="subtle">{user.email} · {user.role}</p></div><SettingsControls/></>; }
