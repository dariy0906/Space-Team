'use client';
import { useEffect } from 'react';

// Анимации лендинга: появление блоков при прокрутке ([data-reveal]) и подсветка карточек за курсором
// ([data-glow]). Без JavaScript и при prefers-reduced-motion всё видно сразу, без анимации.
export default function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.landing');
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

    const items = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
    // То, что уже на экране, показываем сразу — иначе при включении анимаций оно мигнёт.
    for (const el of items) if (el.getBoundingClientRect().top < window.innerHeight * 0.9) el.classList.add('in', 'instant');
    root.classList.add('motion-ready');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -10% 0px' });
    for (const el of items) if (!el.classList.contains('in')) observer.observe(el);

    const glow = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>('[data-glow]');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };
    const nav = root.querySelector<HTMLElement>('.lnav');
    const scrolled = () => nav?.classList.toggle('scrolled', window.scrollY > 24);
    scrolled();
    root.addEventListener('pointermove', glow);
    window.addEventListener('scroll', scrolled, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener('pointermove', glow);
      window.removeEventListener('scroll', scrolled);
    };
  }, []);
  return null;
}
