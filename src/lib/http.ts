/** Shared request boundary, including chunked bodies. */
export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export function sameOrigin(request: Request): boolean {
  try {
    const origin = request.headers.get('origin');
    return !!origin && new URL(origin).origin === new URL(process.env.APP_PUBLIC_URL || request.url).origin;
  } catch {
    return false;
  }
}
export async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new RequestError('Request body too large or invalid length', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError('Request body too large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function readJson(request: Request, limit = 100_000): Promise<unknown> {
  const bytes = await readBody(request, limit);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new RequestError('Invalid JSON', 400);
  }
}
export function requestErrorResponse(error: unknown): Response {
  if (error instanceof RequestError)
    return Response.json({ message: error.message }, { status: error.status });
  throw error;
}
