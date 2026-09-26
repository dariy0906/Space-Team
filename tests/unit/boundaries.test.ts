import test from 'node:test';
import assert from 'node:assert/strict';
import { readBody, readJson, sameOrigin, RequestError } from '../../src/lib/http';
import { activeNavigation } from '../../src/features/navigation/active-navigation';
import { prioritizeTasks, isStaleTask } from '../../src/features/incidents/queue-policy';

const request = (body: string) => new Request('https://example.test/api', { method: 'POST', body });
test('JSON boundary rejects malformed/null JSON and enforces byte limits', async () => {
  await assert.rejects(
    readJson(request('{')),
    (error: unknown) => error instanceof RequestError && error.status === 400,
  );
  await assert.rejects(
    readJson(request('"яя"'), 5),
    (error: unknown) => error instanceof RequestError && error.status === 413,
  );
  assert.deepEqual(await readJson(request('{"action":"stop"}')), { action: 'stop' });
  assert.equal(await readJson(request('null')), null); // Route schema rejects null; parser does not crash.
});
test('chunked body is cancelled before exceeding the limit', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(6));
    },
    cancel() {
      cancelled = true;
    },
  });
  const input = new Request('https://example.test', { method: 'POST', body, duplex: 'half' } as RequestInit);
  await assert.rejects(readBody(input, 10), RequestError);
  assert.equal(cancelled, true);
});
test('origin validation fails closed and includes protocol and port', () => {
  const expected = process.env.APP_PUBLIC_URL || 'https://example.test';
  const check = (origin: string) => sameOrigin(new Request(expected + '/api', { headers: { origin } }));
  assert.equal(check(new URL(expected).origin), true);
  for (const origin of [
    'null',
    'garbage',
    'http://example.test',
    'https://example.test:444',
    'https://evil.test',
  ])
    assert.equal(check(origin), false);
});
test('navigation chooses the most specific section', () => {
  const hrefs = ['/admin', '/admin/cameras'];
  assert.equal(activeNavigation('/admin/cameras/123', hrefs), '/admin/cameras');
  assert.equal(activeNavigation('/administrator', hrefs), undefined);
});
test('critical assignment preserves active travel and relegates stale tasks', () => {
  const now = Date.now();
  const task = (id: string, status: 'ASSIGNED' | 'ON_THE_WAY') => ({
    id,
    status,
    plannedEnd: new Date(now - 1000),
    incident: { severity: 'MEDIUM', isDemo: true },
  });
  const traveling = task('traveling', 'ON_THE_WAY'),
    stale = task('stale', 'ASSIGNED');
  const waiting = { ...task('waiting', 'ASSIGNED'), plannedEnd: new Date(now + 1000) };
  const result = prioritizeTasks([traveling, stale, waiting], { id: 'critical' }, true, now);
  assert.deepEqual(
    result.queue.map((item) => item.id),
    ['traveling', 'critical', 'waiting'],
  );
  assert.deepEqual(
    result.stale.map((item) => item.id),
    ['stale'],
  );
  assert.equal(isStaleTask(traveling, now), false);
  assert.equal(
    isStaleTask({ ...stale, incident: { severity: 'MEDIUM', isDemo: false } }, now),
    false,
    'real overdue work remains in the queue',
  );
});
