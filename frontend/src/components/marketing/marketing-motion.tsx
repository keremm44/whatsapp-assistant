'use client';

import * as React from 'react';

import styles from '@/components/marketing/marketing-motion.module.css';
import { cn } from '@/lib/utils/cn';

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

function useInViewOnce<T extends HTMLElement>(threshold = 0.16) {
  const ref = React.useRef<T | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, visible]);

  return { ref, visible };
}

export function MarketingReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useInViewOnce<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn(styles.reveal, (visible || reduced) && styles.revealVisible, className)}
    >
      {children}
    </div>
  );
}

export function BlurHeadline({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useInViewOnce<HTMLHeadingElement>(0.2);
  const words = React.useMemo(() => text.split(' '), [text]);

  return (
    <h1 ref={ref} className={className}>
      {words.map((word, index) => (
        <React.Fragment key={`${word}-${index}`}>
          <span
            className={cn(
              styles.blurWord,
              (visible || reduced) && styles.blurWordVisible,
            )}
            style={{ transitionDelay: reduced ? '0ms' : `${index * 48}ms` }}
          >
            {word}
          </span>
          {index < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </h1>
  );
}

/**
 * A restrained True-Focus-inspired phrase sequence. All phrases remain
 * readable throughout; focus only adds structural cyan emphasis. It runs
 * once on entry and then settles into a fully readable static sentence.
 */
export function TrueFocusLine({
  words,
  className,
}: {
  words: string[];
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useInViewOnce<HTMLDivElement>(0.45);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  React.useEffect(() => {
    if (!visible || reduced || words.length === 0) return;

    let index = 0;
    setActiveIndex(0);
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= words.length) {
        window.clearInterval(timer);
        setActiveIndex(-1);
        return;
      }
      setActiveIndex(index);
    }, 760);

    return () => window.clearInterval(timer);
  }, [reduced, visible, words.length]);

  return (
    <div ref={ref} className={cn(styles.focusLine, className)} aria-label={words.join(' ')}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          aria-hidden="true"
          className={cn(
            styles.focusWord,
            !reduced && activeIndex === index && styles.focusWordActive,
          )}
        >
          {word}
        </span>
      ))}
    </div>
  );
}

export function MagneticLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  const onPointerMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (reduced || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 7;
    setOffset({ x, y });
  };

  const reset = () => setOffset({ x: 0, y: 0 });

  return (
    <a
      href={href}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onBlur={reset}
      className={cn(styles.magneticLink, className)}
      style={{ transform: reduced ? undefined : `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
    >
      {children}
    </a>
  );
}

const NAV_ITEMS = [
  { href: '#nasil-calisir', label: 'Nasıl çalışır', id: 'nasil-calisir' },
  { href: '#kontrol', label: 'Kontrol', id: 'kontrol' },
  { href: '#dene', label: 'Demo', id: 'dene' },
  { href: '#panel', label: 'Panel', id: 'panel' },
  { href: '#kurulum', label: 'Kurulum', id: 'kurulum' },
] as const;

export function MarketingDockNav() {
  const [activeId, setActiveId] = React.useState<string>('nasil-calisir');

  React.useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (section): section is HTMLElement => section !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: '-20% 0px -58% 0px', threshold: [0.1, 0.3, 0.6] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Sayfa bölümleri" className={cn(styles.dock, 'hidden lg:flex')}>
      {NAV_ITEMS.map((item) => (
        <a
          key={item.id}
          href={item.href}
          aria-current={activeId === item.id ? 'location' : undefined}
          className={cn(styles.dockItem, activeId === item.id && styles.dockItemActive)}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
