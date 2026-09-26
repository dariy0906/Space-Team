import { requireUser } from '@/lib/auth';
import AntifraudScanner from '@/components/antifraud-scanner';
import { geminiEnabled, geminiModel } from '@/lib/antifraud/gemini';
export const dynamic = 'force-dynamic';

export default async function AntifraudPage() {
  await requireUser();
  const ai = { enabled: geminiEnabled(), model: geminiModel() };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">БЕЗОПАСНОСТЬ ЖИТЕЛЕЙ</p>
          <h1>Антифрод-помощник</h1>
          <p className="subtle">Проверка сообщений и договоров на мошеннические схемы по законам РК и РФ</p>
        </div>
        <span className="badge status-confirmed"><span className="live-dot" /> {ai.enabled ? 'ИИ Gemini + правила' : 'Работает локально'}</span>
      </div>
      <AntifraudScanner ai={ai} />
    </>
  );
}
