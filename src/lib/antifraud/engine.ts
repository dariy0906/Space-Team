// Антифрод-движок. Перенесён из проекта QuickCheck (server.py) и переведён на детерминированные
// правила: этот анализ выполняется локально, без внешней модели и без API-ключа, и работает всегда.
// Второе мнение ИИ-модели Google Gemini добавляет серверный модуль ./gemini.ts, заполняя те же поля
// результата (см. combineWithAi).

import { LAW_ARTICLES, countryLaw, type LawArticle, type LawCountry } from './laws';

export const MAX_INPUT_LENGTH = 5000;

export type Verdict = 'МОШЕННИКИ' | 'ПОДОЗРИТЕЛЬНО' | 'БЕЗОПАСНО';

export type SignalCategory = 'financial' | 'credentials' | 'remote' | 'link' | 'urgency' | 'authority' | 'intimidation' | 'isolation' | 'emotion' | 'context' | 'contact';

export type DetectedSignal = {
  id: string;
  category: SignalCategory;
  severity: 'critical' | 'explicit' | 'suspicious' | 'weak';
  label: string;
  /** Фрагменты исходного текста, из-за которых сработало правило. */
  matches: string[];
};

export type AntifraudResult = {
  verdict: Verdict;
  riskScore: number;
  explanation: string;
  instructions: string;
  socialEngineeringSigns: string[];
  detectedArticle: string | null;
  signals: DetectedSignal[];
  articles: LawArticle[];
  entities: { urls: string[]; phones: string[]; cards: string[] };
  sanitized: boolean;
  truncated: boolean;
  /** rules — только локальные правила; gemini — итог объединён с мнением модели Gemini. */
  engine: 'rules' | 'gemini';
  /** Оценки модели и правил по отдельности, если проверка шла через ИИ. */
  ai?: { model: string; verdict: Verdict; riskScore: number } | null;
  rules?: { verdict: Verdict; riskScore: number } | null;
  /** Почему ИИ-анализ не выполнен (ключ, лимит, сбой API) — тогда показан вердикт правил. */
  aiError?: string | null;
};

export const verdictRank: Record<Verdict, number> = { 'БЕЗОПАСНО': 0, 'ПОДОЗРИТЕЛЬНО': 1, 'МОШЕННИКИ': 2 };

export const categoryLabel: Record<SignalCategory, string> = {
  financial: 'Требование денег',
  credentials: 'Запрос кодов и данных',
  remote: 'Удалённый доступ',
  link: 'Подозрительные ссылки',
  urgency: 'Ложная срочность',
  authority: 'Апелляция к авторитету',
  intimidation: 'Запугивание',
  isolation: 'Изоляция жертвы',
  emotion: 'Эмоциональное давление',
  context: 'Подмена контекста',
  contact: 'Контактные данные',
};

// В JavaScript \b опирается на ASCII-класс \w и с кириллицей не работает:
// /\bсрочно\b/ не находит «это срочно». Поэтому границы слова задаём явно.
const BEFORE = '(?<![а-яёА-ЯЁa-zA-Z0-9])';
const AFTER = '(?![а-яёА-ЯЁa-zA-Z0-9])';
/** Выражение с корректными границами слова для русского текста. */
const word = (body: string): RegExp => new RegExp(`${BEFORE}(?:${body})${AFTER}`, 'i');

type Rule = {
  id: string;
  category: SignalCategory;
  severity: DetectedSignal['severity'];
  label: string;
  patterns: RegExp[];
};

// Правила повторяют блоки CLASSIFICATION_CRITERIA_BLOCK и SOCIAL_ENGINEERING_BLOCK из QuickCheck.
const RULES: Rule[] = [
  // ── Явные признаки обмана: risk 95-100 ──
  { id: 'sms-code', category: 'credentials', severity: 'critical', label: 'Запрашивают код из SMS или одноразовый пароль', patterns: [/код\s+из\s+(?:смс|sms|сообщени)/i, /одноразов[а-яёА-ЯЁ]*\s+(?:код|пароль)/i, /назовите\s+код/i, /продиктуйте\s+код/i, /сообщите\s+код/i, /введите\s+код\s+подтверждени/i, /код\s+подтверждени[а-яёА-ЯЁ]*\s+(?:из|для|который)/i] },
  { id: 'card-secrets', category: 'credentials', severity: 'critical', label: 'Запрашивают CVV, PIN-код или пароль от банка', patterns: [/\bcvv\b/i, /\bcvc\b/i, /пин[\s-]?код/i, word('пароль\\s+от\\s+(?:карты|банка|личного\\s+кабинета|приложени[а-яёА-ЯЁ]*)'), /срок\s+действия\s+карты/i, /полный\s+номер\s+карты/i] },
  { id: 'safe-account', category: 'financial', severity: 'critical', label: 'Предлагают перевести деньги на «безопасный счёт»', patterns: [/безопасн[а-яёА-ЯЁ]*\s+счёт/i, /безопасн[а-яёА-ЯЁ]*\s+счет/i, /резервн[а-яёА-ЯЁ]*\s+счёт/i, /страхов[а-яёА-ЯЁ]*\s+ячейк/i, /защищённ[а-яёА-ЯЁ]*\s+счёт/i] },
  { id: 'transfer-now', category: 'financial', severity: 'critical', label: 'Требуют перевести деньги на чужой счёт', patterns: [/срочно\s+перевед/i, /немедленно\s+перевед/i, /перевед[иё]те\s+(?:деньги|сумму|средства)/i, /перевед[иё]те(?:\s+\S+){0,4}?\s+на\s+(?:карту|счёт|счет|кошел|номер)/i, /отправьте\s+(?:деньги|перевод|сумму)\s+на/i, /оплатите\s+срочно/i] },
  { id: 'remote-access', category: 'remote', severity: 'critical', label: 'Просят установить приложение удалённого доступа', patterns: [/anydesk/i, /teamviewer/i, /rustdesk/i, /удал[её]нн[а-яёА-ЯЁ]*\s+доступ/i, /установите\s+приложени[а-яёА-ЯЁ]*\s+(?:для|чтобы)/i, /скачайте\s+приложени/i, /установите\s+апк/i, /\.apk\b/i] },

  // ── Явное мошенничество: risk 70-94 ──
  { id: 'account-block', category: 'intimidation', severity: 'explicit', label: 'Угрожают блокировкой счёта и требуют действий', patterns: [/блокировк[а-яёА-ЯЁ]*\s+(?:счёт|счет|карт)/i, /счёт\s+(?:будет\s+)?заблокирован/i, /карта\s+(?:будет\s+)?заблокирован/i, /заблокируем\s+(?:счёт|карту)/i] },
  { id: 'personal-data-link', category: 'credentials', severity: 'explicit', label: 'Просят ввести личные данные по ссылке', patterns: [/перейдите\s+по\s+ссылк/i, /введите\s+(?:свои\s+)?(?:данные|реквизиты|логин)/i, /подтвердите\s+(?:данные|личность)\s+по\s+ссылк/i, /авторизуйтесь\s+по\s+ссылк/i] },
  { id: 'credit-fraud', category: 'intimidation', severity: 'explicit', label: 'Сообщают о попытке оформить кредит на ваше имя', patterns: [/оформ[а-яёА-ЯЁ]*\s+кредит\s+на\s+(?:ваше|твоё|ваш)/i, /пытались\s+оформить\s+(?:кредит|займ)/i, /заявка\s+на\s+кредит\s+от\s+вашего/i] },
  { id: 'criminal-case', category: 'intimidation', severity: 'explicit', label: 'Пугают уголовным делом или арестом', patterns: [/уголовн[а-яёА-ЯЁ]*\s+дел/i, /арест[а-яёА-ЯЁ]*\s+имуществ/i, /возбужден[а-яёА-ЯЁ]*\s+дело/i, /привлеч[а-яёА-ЯЁ]*\s+к\s+ответственности/i, /вас\s+задерж/i] },
  { id: 'crypto-invest', category: 'financial', severity: 'explicit', label: 'Предлагают гарантированный доход или инвестиции', patterns: [/гарантированн[а-яёА-ЯЁ]*\s+доход/i, /(?:\d{2,3})\s*%\s*(?:в|за)\s*(?:день|неделю|месяц)/i, /инвестиц[а-яёА-ЯЁ]*\s+с\s+гарант/i, /удвоим\s+(?:ваши\s+)?(?:деньги|вложени)/i, /криптокошел/i] },
  { id: 'prize', category: 'emotion', severity: 'explicit', label: 'Сообщают о выигрыше, требующем оплаты', patterns: [/вы\s+(?:стали\s+)?победител/i, /вы\s+выиграл/i, /ваш\s+приз/i, /оплатите\s+(?:комиссию|налог|доставку)\s+(?:за\s+)?приз/i, /получите\s+выигрыш/i] },

  // ── Подозрительные признаки: risk 30-69 ──
  { id: 'urgency', category: 'urgency', severity: 'suspicious', label: 'Создаётся искусственная срочность', patterns: [word('срочно'), /немедленно/i, /сейчас\s+же/i, /экстренно/i, /последний\s+шанс/i, /в\s+течение\s+(?:24\s+часов|часа|15\s+минут|\d+\s+минут)/i, /до\s+конца\s+дня/i, /осталось\s+\d+\s+(?:минут|час)/i, /успейте/i] },
  { id: 'authority', category: 'authority', severity: 'suspicious', label: 'Представляются сотрудником банка или госоргана', patterns: [/служб[а-яёА-ЯЁ]*\s+безопасности/i, /сотрудник[а-яёА-ЯЁ]*\s+банка/i, /специалист[а-яёА-ЯЁ]*\s+банка/i, word('полици[а-яёА-ЯЁ]*'), /прокуратур/i, /следовател/i, /налогов[а-яёА-ЯЁ]*\s+(?:служба|инспекци)/i, /пенсионн[а-яёА-ЯЁ]*\s+фонд/i, /центральн[а-яёА-ЯЁ]*\s+банк/i, /нацбанк/i, /финпол/i, word('мвд'), word('фсб'), /следственн[а-яёА-ЯЁ]*\s+комитет/i, /отдел\s+по\s+борьбе/i] },
  { id: 'isolation', category: 'isolation', severity: 'suspicious', label: 'Просят никому не рассказывать', patterns: [/никому\s+не\s+(?:говорите|сообщайте|рассказывайте)/i, /тайн[а-яёА-ЯЁ]*\s+операци/i, /секретн[а-яёА-ЯЁ]*\s+проверк/i, /не\s+кладите\s+трубку/i, /оставайтесь\s+на\s+лини/i, /банковск[а-яёА-ЯЁ]*\s+тайн[а-яёА-ЯЁ]*\s+не\s+разглаш/i] },
  { id: 'context-swap', category: 'context', severity: 'suspicious', label: 'Подмена контекста: беда с родственником', patterns: [/попал[а-яёА-ЯЁ]*\s+в\s+дтп/i, /ваш\s+(?:сын|дочь|внук|внучка|родственник)\s+(?:задержан|попал|в\s+беде)/i, /мам[а-яёА-ЯЁ]*,?\s+у\s+меня\s+проблем/i, /нужна\s+помощь,?\s+я\s+в\s+полиц/i] },
  { id: 'parcel', category: 'link', severity: 'suspicious', label: 'Сообщение о посылке или доставке от неизвестного отправителя', patterns: [/ваша\s+посылк/i, /не\s+доставлен[а-яёА-ЯЁ]*\s+отправлени/i, /оплатите\s+доставк/i, /таможенн[а-яёА-ЯЁ]*\s+сбор/i, /трек[\s-]?номер/i] },
  { id: 'guilt-help', category: 'emotion', severity: 'suspicious', label: 'Давят на чувство вины или предлагают «помощь»', patterns: [/мы\s+поможем\s+(?:защитить|сохранить|спасти)/i, /из-за\s+вас\s+пострада/i, /вы\s+виноват/i, /только\s+мы\s+можем\s+помочь/i] },
  { id: 'clarify-data', category: 'credentials', severity: 'suspicious', label: 'Просят «уточнить данные» без конкретики', patterns: [/уточнит[а-яёА-ЯЁ]*\s+(?:ваши\s+)?данны/i, /подтвердите\s+личность/i, /обновите\s+(?:данные|анкету)/i, /верификац[а-яёА-ЯЁ]*\s+аккаунт/i] },
  { id: 'loan-offer', category: 'financial', severity: 'suspicious', label: 'Непрошенное предложение кредита или займа', patterns: [/одобрен[а-яёА-ЯЁ]*\s+(?:кредит|займ)/i, /предодобрен/i, /деньги\s+под\s+\d+\s*%/i, /займ\s+без\s+отказа/i] },
];

const URL_PATTERN = /(?:https?:\/\/[^\s<>"'«»]+|www\.[^\s<>"'«»]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-z]{2,}(?:\/[^\s<>"'«»]*)?)/gi;
const PHONE_PATTERNS = [/\+7[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, /\b8[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, /\+7\d{10}/g];
const CARD_PATTERN = /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g;

const RISKY_TLD = ['.top', '.xyz', '.icu', '.click', '.link', '.cfd', '.rest', '.buzz', '.loan', '.work', '.fit', '.zip', '.mov', '.ru.com'];
const SHORTENERS = ['bit.ly', 'clck.ru', 'tinyurl.com', 'is.gd', 'cutt.ly', 't.ly', 'goo.su', 'vk.cc', 'u.to', 'qps.ru'];
const BANK_BRANDS = ['kaspi', 'halyk', 'jusan', 'forte', 'sberbank', 'sber', 'tinkoff', 'tbank', 'alfabank', 'alfa', 'vtb', 'gosuslugi', 'egov'];

// Попытки подменить инструкции модели. Фильтруются так же, как в sanitize_input.
const INJECTION_PATTERNS = [/ignore\s+(all\s+)?previous\s+instructions/gi, /system\s*:/gi, /assistant\s*:/gi, /\buser\s*:/gi, /forget\s+(everything|all)/gi, /new\s+instructions?\s*:/gi, /override\s+prompt/gi, /act\s+as\s+(?:if\s+)?you\s+are/gi, /pretend\s+(?:you\s+are|to\s+be)/gi];

export function sanitizeInput(raw: string): { text: string; sanitized: boolean; truncated: boolean } {
  if (typeof raw !== 'string') return { text: '', sanitized: false, truncated: false };
  const truncated = raw.length > MAX_INPUT_LENGTH;
  let text = raw.slice(0, MAX_INPUT_LENGTH);
  let sanitized = false;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      sanitized = true;
      text = text.replace(pattern, '[ОТФИЛЬТРОВАНО]');
    }
    pattern.lastIndex = 0;
  }
  return { text: text.trim(), sanitized, truncated };
}

export function luhnCheck(card: string): boolean {
  const digits = card.split('').map(Number);
  if (digits.some(Number.isNaN)) return false;
  let total = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const fromRight = digits.length - 1 - i;
    let digit = digits[i];
    if (fromRight % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
  }
  return total % 10 === 0;
}

export function extractUrls(text: string): string[] {
  const found = text.match(URL_PATTERN) ?? [];
  return [...new Set(found.filter(url => url.includes('.') && url.length > 5))];
}

export function extractPhones(text: string): string[] {
  const found: string[] = [];
  for (const pattern of PHONE_PATTERNS) found.push(...(text.match(pattern) ?? []));
  return [...new Set(found)];
}

export function extractCards(text: string): string[] {
  const found = text.match(CARD_PATTERN) ?? [];
  const valid = found.filter(card => {
    const digits = card.replace(/[\s-]/g, '');
    return digits.length === 16 && luhnCheck(digits);
  });
  return [...new Set(valid)];
}

export function maskCard(card: string): string {
  const digits = card.replace(/[\s-]/g, '');
  return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
}

/** Домены и ссылки, которые сами по себе выглядят как фишинг. */
function inspectUrls(urls: string[]): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const add = (id: string, severity: DetectedSignal['severity'], label: string, matches: string[]) => {
    if (matches.length > 0) signals.push({ id, category: 'link', severity, label, matches: [...new Set(matches)] });
  };
  const host = (url: string) => url.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();

  add('url-ip', 'explicit', 'Ссылка ведёт на голый IP-адрес вместо домена', urls.filter(u => /^(?:https?:\/\/)?\d{1,3}(?:\.\d{1,3}){3}/.test(u)));
  add('url-punycode', 'explicit', 'Домен использует подменные символы (punycode)', urls.filter(u => host(u).includes('xn--')));
  add('url-brand', 'explicit', 'Домен имитирует банк или госпортал', urls.filter(u => {
    const h = host(u);
    const brand = BANK_BRANDS.find(b => h.includes(b));
    if (!brand) return false;
    return !new RegExp(`(?:^|\\.)${brand}\\.(kz|ru|com)$`).test(h);
  }));
  add('url-shortener', 'suspicious', 'Ссылка спрятана за сокращателем', urls.filter(u => SHORTENERS.some(s => host(u).includes(s))));
  add('url-tld', 'suspicious', 'Домен в зоне, популярной у мошенников', urls.filter(u => RISKY_TLD.some(tld => host(u).endsWith(tld))));
  add('url-subdomains', 'suspicious', 'Длинная цепочка поддоменов маскирует настоящий адрес', urls.filter(u => host(u).split('.').length >= 5));
  add('url-insecure', 'weak', 'Ссылка без HTTPS', urls.filter(u => /^http:\/\//i.test(u)));
  return signals;
}

/** Подбор статей: совпадение ключевого слова — 2 балла, слова из примера — 1. Как в find_relevant_articles. */
export function findRelevantArticles(text: string, country: LawCountry, maxArticles = 5): LawArticle[] {
  const lower = text.toLowerCase();
  const scored: { score: number; article: LawArticle }[] = [];
  for (const article of LAW_ARTICLES) {
    if (article.country !== country) continue;
    let score = 0;
    for (const keyword of article.keywords) if (lower.includes(keyword.toLowerCase())) score += 2;
    for (const example of article.examples) {
      if (example.split(/\s+/).some(word => word.length > 3 && lower.includes(word.toLowerCase()))) score += 1;
    }
    if (score > 0) scored.push({ score, article });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxArticles).map(item => item.article);
}

function matchRules(text: string): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  for (const rule of RULES) {
    const matches: string[] = [];
    for (const pattern of rule.patterns) {
      const found = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
      if (found) matches.push(...found.map(m => m.trim()));
    }
    if (matches.length > 0) signals.push({ id: rule.id, category: rule.category, severity: rule.severity, label: rule.label, matches: [...new Set(matches)].slice(0, 4) });
  }
  return signals;
}

function scoreOf(signals: DetectedSignal[]): number {
  const count = (severity: DetectedSignal['severity']) => signals.filter(s => s.severity === severity).length;
  const critical = count('critical');
  const explicit = count('explicit');
  const suspicious = count('suspicious');
  const weak = count('weak');

  // Диапазоны взяты из CLASSIFICATION_CRITERIA_BLOCK, чтобы вердикт совпадал с исходным продуктом.
  if (critical > 0) return Math.min(100, 95 + (critical - 1) * 2 + Math.min(3, explicit));
  if (explicit > 0) return Math.min(94, 70 + (explicit - 1) * 7 + suspicious * 3);
  if (suspicious > 0) return Math.min(69, 32 + (suspicious - 1) * 9 + weak * 3);
  return Math.min(29, weak * 9);
}

export function verdictOf(score: number): Verdict {
  if (score >= 70) return 'МОШЕННИКИ';
  if (score >= 30) return 'ПОДОЗРИТЕЛЬНО';
  return 'БЕЗОПАСНО';
}

function buildExplanation(verdict: Verdict, signals: DetectedSignal[], article: LawArticle | null, entities: AntifraudResult['entities'], law: (typeof countryLaw)[LawCountry]): string {
  if (verdict === 'БЕЗОПАСНО') {
    return signals.length === 0
      ? 'Признаков мошенничества не обнаружено: в тексте нет требований перевести деньги, запросов кодов и платёжных данных, ссылок и давления на срочность.'
      : `Явных признаков обмана нет. Отмечены лишь слабые маркеры: ${signals.map(s => s.label.toLowerCase()).join('; ')}. Этого недостаточно для вывода о мошенничестве.`;
  }
  const top = signals.filter(s => s.severity === 'critical' || s.severity === 'explicit').slice(0, 3);
  const listed = (top.length > 0 ? top : signals.slice(0, 3)).map(s => s.label.toLowerCase()).join('; ');
  const facts: string[] = [];
  if (entities.urls.length > 0) facts.push(`ссылок: ${entities.urls.length}`);
  if (entities.phones.length > 0) facts.push(`телефонов: ${entities.phones.length}`);
  if (entities.cards.length > 0) facts.push(`номеров карт: ${entities.cards.length}`);
  const factLine = facts.length > 0 ? ` В тексте также найдено — ${facts.join(', ')}.` : '';
  const lawLine = article ? ` Описанная схема подпадает под ${article.article} («${article.title}»). Санкции: ${article.sanctions}.` : ` Точную квалификацию по ${law.code} определит правоохранительный орган.`;
  const lead = verdict === 'МОШЕННИКИ'
    ? 'Это мошенническая схема: сработали прямые признаки обмана —'
    : 'Сообщение вызывает сомнения: прямого требования денег или кодов нет, но присутствуют —';
  return `${lead} ${listed}.${factLine}${lawLine}`;
}

function buildInstructions(verdict: Verdict, signals: DetectedSignal[], law: (typeof countryLaw)[LawCountry]): string {
  if (verdict === 'МОШЕННИКИ') {
    const steps = ['Прекратите общение и не выполняйте никаких требований', 'Не сообщайте коды, CVV, PIN и пароли — сотрудники банка их никогда не спрашивают'];
    if (signals.some(s => s.category === 'remote')) steps.push('Немедленно удалите установленное приложение удалённого доступа');
    if (signals.some(s => s.category === 'link')) steps.push('Не открывайте ссылку; если уже вводили данные — смените пароли и заблокируйте карту');
    steps.push(`${law.hotline} и сообщите о попытке мошенничества`);
    return `${steps.join('. ')}.`;
  }
  if (verdict === 'ПОДОЗРИТЕЛЬНО') {
    return `Не переходите по ссылкам и не отправляйте документы до проверки. Свяжитесь с организацией самостоятельно — по номеру с официального сайта или обратной стороны карты, а не по контактам из сообщения. При любом запросе денег или кодов звоните ${law.police}.`;
  }
  return 'Явной угрозы нет. Обычная осторожность: проверяйте отправителя, прежде чем открывать вложения, и никогда не пересылайте коды подтверждения.';
}

/** Полный офлайн-анализ текста. Вердикт, риск и статья вычисляются правилами, без внешних сервисов. */
export function analyzeText(raw: string, country: LawCountry = 'KZ'): AntifraudResult {
  const { text, sanitized, truncated } = sanitizeInput(raw);
  const law = countryLaw[country];
  const entities = { urls: extractUrls(text), phones: extractPhones(text), cards: extractCards(text) };

  const signals = [...matchRules(text), ...inspectUrls(entities.urls)];
  if (entities.cards.length > 0) {
    signals.push({ id: 'card-number', category: 'financial', severity: 'explicit', label: 'В сообщении указан номер банковской карты для перевода', matches: entities.cards.map(maskCard) });
  }
  const order: DetectedSignal['severity'][] = ['critical', 'explicit', 'suspicious', 'weak'];
  signals.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  const riskScore = scoreOf(signals);
  const verdict = verdictOf(riskScore);
  const articles = verdict === 'БЕЗОПАСНО' ? [] : findRelevantArticles(text, country);
  const detected = articles.find(a => a.appliesTo.includes(verdict)) ?? articles[0] ?? null;

  return {
    verdict,
    riskScore,
    explanation: buildExplanation(verdict, signals, detected, entities, law),
    instructions: buildInstructions(verdict, signals, law),
    socialEngineeringSigns: signals.filter(s => s.severity !== 'weak').map(s => s.label),
    detectedArticle: detected ? detected.article : null,
    signals,
    articles,
    entities,
    sanitized,
    truncated,
    engine: 'rules',
  };
}
