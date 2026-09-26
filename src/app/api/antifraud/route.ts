// Проверка текста антифрод-помощником: локальные правила всегда, плюс второе мнение Gemini,
// если на сервере задан GEMINI_API_KEY и пользователь не отключил ИИ-анализ.
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { readJson, RequestError, sameOrigin } from '@/lib/http';
import { analyzeText, MAX_INPUT_LENGTH, sanitizeInput, type AntifraudResult } from '@/lib/antifraud/engine';
import { askGemini, combineWithAi, geminiEnabled } from '@/lib/antifraud/gemini';

const bodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_INPUT_LENGTH),
  country: z.enum(['KZ', 'RU']),
  useAi: z.boolean().default(true),
});

// Ключ общий на всех, поэтому ограничиваем число ИИ-проверок на пользователя.
const AI_LIMIT = 10;
const AI_WINDOW_MS = 60_000;
const recent = new Map<string, number[]>();

function allowAi(userId: string): boolean {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter(t => now - t < AI_WINDOW_MS);
  const allowed = list.length < AI_LIMIT;
  if (allowed) list.push(now);
  recent.set(userId, list);
  return allowed;
}

const reply = (body: AntifraudResult | { error: string }, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: 'Запрос отклонён: другой источник' }, 403);
  const user = await currentUser();
  if (!user) return reply({ error: 'Нужно войти в систему' }, 401);
  let body: unknown;
  try {
    body = await readJson(request, 40_000);
  } catch (e) {
    if (e instanceof RequestError) return reply({ error: e.status === 413 ? 'Слишком большой запрос' : 'Некорректный запрос' }, e.status);
    throw e;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return reply({ error: `Нужен текст длиной до ${MAX_INPUT_LENGTH} символов` }, 400);
  const { text, country, useAi } = parsed.data;

  const rules = analyzeText(text, country);
  if (!useAi) return reply(rules);
  if (!geminiEnabled()) return reply({ ...rules, aiError: 'ИИ-анализ не настроен на сервере (нет GEMINI_API_KEY)' });
  if (!allowAi(user.id)) return reply({ ...rules, aiError: `не больше ${AI_LIMIT} ИИ-проверок в минуту` });

  try {
    const ai = await askGemini(sanitizeInput(text).text, country);
    return reply(combineWithAi(rules, ai, country));
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Gemini недоступен';
    // Текст обращения в журнал не пишем — только причину сбоя.
    console.warn('[antifraud] Gemini:', reason);
    return reply({ ...rules, aiError: reason });
  }
}
