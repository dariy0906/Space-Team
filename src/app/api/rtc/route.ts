import { currentUser } from '@/lib/auth';
import { cameraSession } from '@/lib/cameras';
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const allowed = token ? await cameraSession(token) : await currentUser();
  if (!allowed) return new Response('Unauthorized', { status: 401 });
  const iceServers: RTCIceServer[] = [{ urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL)
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    });
  return Response.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}
