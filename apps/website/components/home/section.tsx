import type { ReactNode } from 'react';

export function SectionHeader({
  id,
  eyebrow,
  title,
  lede,
  align = 'start'
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'start' | 'center';
}) {
  return (
    <header className="section-header" data-align={align}>
      <p className="section-eyebrow">{eyebrow}</p>
      <h2 className="section-title" id={id}>
        {title}
      </h2>
      {lede ? <p className="section-lede">{lede}</p> : null}
    </header>
  );
}
