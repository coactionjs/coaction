'use client';

import { useEffect } from 'react';

const DEFAULT_TILT = 6;

/**
 * Tilts every `[data-tilt]` card on the homepage toward the pointer and
 * moves a light across it; the attribute sets the largest tilt in degrees.
 * Fine pointers only, and nothing runs when reduced motion is preferred.
 */
export function TiltEffects() {
  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reducedMotion.matches) return;

    let active: HTMLElement | null = null;
    let frame = 0;
    let pending: { element: HTMLElement; x: number; y: number } | null = null;

    const release = (element: HTMLElement) => {
      element.classList.remove('is-tilting');
      element.style.removeProperty('--tilt-x');
      element.style.removeProperty('--tilt-y');
    };

    const paint = () => {
      frame = 0;
      if (!pending) return;
      const { element, x, y } = pending;
      const box = element.getBoundingClientRect();
      const px = Math.min(Math.max((x - box.left) / box.width, 0), 1);
      const py = Math.min(Math.max((y - box.top) / box.height, 0), 1);
      const max = Number(element.dataset.tilt) || DEFAULT_TILT;
      element.style.setProperty(
        '--tilt-x',
        `${((0.5 - py) * max).toFixed(2)}deg`
      );
      element.style.setProperty(
        '--tilt-y',
        `${((px - 0.5) * max).toFixed(2)}deg`
      );
      element.style.setProperty('--spot-x', `${(px * 100).toFixed(1)}%`);
      element.style.setProperty('--spot-y', `${(py * 100).toFixed(1)}%`);
      element.classList.add('is-tilting');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const target = event.target instanceof Element ? event.target : null;
      const element =
        target?.closest<HTMLElement>('.home-page [data-tilt]') ?? null;
      if (element !== active) {
        if (active) release(active);
        active = element;
      }
      if (!element) return;
      pending = { element, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onPointerOut = (event: PointerEvent) => {
      if (active && !event.relatedTarget) {
        release(active);
        active = null;
      }
    };

    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onPointerOut);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      if (active) release(active);
    };
  }, []);

  return null;
}
