import type { ComponentProps } from 'react';

export function CoactionMark(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M32 4c-8.2 0-14.8 6.5-14.8 14.6 0 4.5 2 8.6 5.3 11.3 1.2 1 .5 3-1.1 2.6-5.8-1.4-8.9-7.7-17.4-8.7-1.5-.2-2.4 1.6-1.3 2.6 4.9 4.3 6.1 10.2 11.7 13.5 1.2.7.7 2.5-.7 2.5-4.2.1-7.2-1.2-10.7-2.9-1.5-.7-2.9 1-1.8 2.2 5 5.7 11.7 8.6 19 7.1 5.2-1.1 7.1-5.7 12.1-5.7s6.9 4.6 12.1 5.7c7.3 1.5 14-1.4 19-7.1 1.1-1.2-.3-2.9-1.8-2.2-3.5 1.7-6.5 3-10.7 2.9-1.4 0-1.9-1.8-.7-2.5 5.6-3.3 6.8-9.2 11.7-13.5 1.1-1 .2-2.8-1.3-2.6-8.5 1-11.6 7.3-17.4 8.7-1.6.4-2.3-1.6-1.1-2.6 3.3-2.7 5.3-6.8 5.3-11.3C46.8 10.5 40.2 4 32 4Z"
      />
    </svg>
  );
}

export function CoactionLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="coaction-logo">
      <CoactionMark className="coaction-logo__mark" />
      {!compact && <span>Coaction</span>}
    </span>
  );
}
