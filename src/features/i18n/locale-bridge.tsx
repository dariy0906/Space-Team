'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { usePreference } from '@/features/preferences/use-preference';
import { kk } from './kk';

const attributes = ['aria-label', 'title', 'placeholder', 'alt'] as const;
const originals = new WeakMap<Node, { source: string; output: string }>();
const originalAttributes = new WeakMap<Element, Map<string, { source: string; output: string }>>();
const months: Record<string, string> = {
  'янв.': 'қаң.', 'февр.': 'ақп.', 'мар.': 'нау.', 'апр.': 'сәу.',
  'мая': 'мам.', 'июн.': 'мау.', 'июл.': 'шіл.', 'авг.': 'там.',
  'сент.': 'қыр.', 'окт.': 'қаз.', 'нояб.': 'қар.', 'дек.': 'жел.',
};

function translate(source: string): string {
  const trimmed = source.trim();
  const translation = kk[trimmed];
  if (translation) return source.replace(trimmed, translation);
  return source.replace(/(янв\.|февр\.|мар\.|апр\.|мая|июн\.|июл\.|авг\.|сент\.|окт\.|нояб\.|дек\.)/g, match => months[match] ?? match);
}

function applyText(node: Text, language: 'ru' | 'kk') {
  const parent = node.parentElement;
  if (!parent || parent.closest('script,style,textarea,code,pre,[contenteditable="true"],[data-no-translate]')) return;
  const current = node.data;
  const previous = originals.get(node);
  const source = previous && current === previous.output ? previous.source : current;
  const output = language === 'kk' ? translate(source) : source;
  originals.set(node, { source, output });
  if (current !== output) node.data = output;
}

function applyAttributes(element: Element, language: 'ru' | 'kk') {
  let known = originalAttributes.get(element);
  if (!known) { known = new Map(); originalAttributes.set(element, known); }
  for (const name of attributes) {
    const current = element.getAttribute(name);
    if (!current) continue;
    const previous = known.get(name);
    const source = previous && current === previous.output ? previous.source : current;
    const output = language === 'kk' ? translate(source) : source;
    known.set(name, { source, output });
    if (current !== output) element.setAttribute(name, output);
  }
}

function applyTree(root: Node, language: 'ru' | 'kk') {
  if (root.nodeType === Node.TEXT_NODE) { applyText(root as Text, language); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root as Element;
  if (element.matches('script,style,textarea,code,pre,[contenteditable="true"],[data-no-translate]')) return;
  applyAttributes(element, language);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const item = walker.currentNode;
    if (item.nodeType === Node.TEXT_NODE) applyText(item as Text, language);
    else applyAttributes(item as Element, language);
  }
}

export default function LocaleBridge() {
  const [value] = usePreference('lang', 'ru');
  const pathname = usePathname();
  const language = value === 'kk' ? 'kk' : 'ru';
  useEffect(() => {
    document.documentElement.lang = language;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      applyTree(document.body, language);
      document.title = language === 'kk' ? 'SU AQTAU — қалалық қауіпсіздік' : 'SU AQTAU — городская безопасность';
    };
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; apply(); }, 1000);
    };
    schedule();
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' || record.type === 'characterData' || record.type === 'attributes')) schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes] });
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [language, pathname]);
  return null;
}
