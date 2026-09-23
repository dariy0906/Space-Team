import Shell from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
export default async function DashboardLayout({ children }: { children: React.ReactNode }) { const user = await requireUser(); const notifications = user.role === 'OPERATOR' ? await db.incident.count({ where: { status: 'NEW' } }) : user.role === 'WORKER' ? await db.workerTask.count({ where: { workerId: user.id, status: 'ASSIGNED' } }) : await db.incident.count({ where: { reporterId: user.id, status: 'RESOLVED' } }); return <Shell user={user} notifications={notifications}>{children}</Shell>; }
