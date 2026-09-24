import Shell from '@/components/shell';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
export default async function DashboardLayout({children}:{children:React.ReactNode}){const user=await requireUser();const notifications=await db.notification.count({where:{userId:user.id,readAt:null}});return <Shell user={user} notifications={notifications}>{children}</Shell>;}

