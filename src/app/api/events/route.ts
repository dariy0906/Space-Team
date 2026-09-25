import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const last = request.headers.get('last-event-id');
  const maximum = (await db.realtimeEvent.aggregate({ _max: { id: true } }))._max.id ?? 0n;
  const parsed = last && /^\d{1,19}$/.test(last) ? BigInt(last) : maximum;
  let cursor = parsed <= maximum ? parsed : maximum;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let healthy = true;
  const expires = Date.now() + 5 * 60_000;
  let dispose = () => {};
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = () => {
        if (closed) return;
        dispose();
        try {
          controller.close();
        } catch {
          /* Already cancelled by the consumer. */
        }
      };
      dispose = () => {
        closed = true;
        clearTimeout(timer);
        request.signal.removeEventListener('abort', finish);
      };
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      request.signal.addEventListener('abort', finish, { once: true });
      if (request.signal.aborted) {
        finish();
        return;
      }
      const tick = async () => {
        if (closed) return;
        if (Date.now() >= expires) {
          finish();
          return;
        }
        try {
          const events = await db.realtimeEvent.findMany({
            where: { id: { gt: cursor }, OR: [{ userId: user.id }, { role: user.role }] },
            orderBy: { id: 'asc' },
            take: 100,
          });
          if (closed) return;
          if (!healthy) {
            send(`event: ready\ndata: {}\n\n`);
            healthy = true;
          }
          if (events.length) {
            cursor = events[events.length - 1].id;
            send(`id: ${cursor}\nevent: changed\ndata: {}\n\n`);
          } else send(': heartbeat\n\n');
        } catch {
          healthy = false;
          send('event: unavailable\ndata: {}\n\n');
        }
        if (!closed) timer = setTimeout(tick, 1500);
      };
      send(`id: ${cursor}\nevent: ready\ndata: {}\n\n`);
      void tick();
    },
    cancel() {
      dispose();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
