import type { Locale } from '@/lib/i18n';
import { CompareCode } from './compare-code';
import { Hero } from './hero';
import { Ideas } from './ideas';
import { PlaygroundSection } from './playground-section';
import { TiltEffects } from './tilt-effects';
import { Transitions } from './transitions';

export function LandingPage({ lang }: { lang: Locale }) {
  return (
    <main className="home-page">
      <Hero lang={lang} />
      <Ideas lang={lang} />
      <PlaygroundSection lang={lang} />
      <CompareCode lang={lang} />
      <Transitions lang={lang} />
      <TiltEffects />
    </main>
  );
}
