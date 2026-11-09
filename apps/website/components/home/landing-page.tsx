import type { Locale } from '@/lib/i18n';
import { CompareCode } from './compare-code';
import { Ecosystem } from './ecosystem';
import { Hero } from './hero';
import { Ideas } from './ideas';
import { Performance } from './performance';
import { PlaygroundSection } from './playground-section';
import { Runtime } from './runtime';
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
      <Runtime lang={lang} />
      <Performance lang={lang} />
      <Ecosystem lang={lang} />
      <TiltEffects />
    </main>
  );
}
