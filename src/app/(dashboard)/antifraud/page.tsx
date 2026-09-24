import { requireUser } from '@/lib/auth';
import AntifraudScanner from '@/components/antifraud-scanner';

export default async function AntifraudPage() {
  await requireUser();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">БЕЗОПАСНОСТЬ ЖИТЕЛЕЙ</p>
          <h1>Антифрод-помощник</h1>
          <p className="subtle">Проверка сообщений и договоров на мошеннические схемы по законам РК и РФ</p>
        </div>
        <span className="badge status-confirmed"><span className="live-dot" /> Работает локально</span>
      </div>
      <AntifraudScanner />
    </>
  );
}
