import type { ComponentProps } from 'react';
import { octopus } from '@/lib/brand';

export function CoactionMark(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox={octopus.viewBox} aria-hidden="true" {...props}>
      <path fill="currentColor" d={octopus.path} />
    </svg>
  );
}

export function CoactionLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="coaction-logo">
      <CoactionMark className="coaction-logo__mark" />
      {!compact && <span className="coaction-logo__word">Coaction</span>}
    </span>
  );
}
