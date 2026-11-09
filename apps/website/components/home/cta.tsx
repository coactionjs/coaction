import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ExtrudedOctopus } from '@/components/extruded-octopus';
import { GitHubIcon } from '@/components/icons';
import type { Locale } from '@/lib/i18n';
import { githubUrl, localePath } from '@/lib/site';
import { CopyButton } from './copy-button';

const install = 'npm install coaction @coaction/react';

const copy = {
  en: {
    title: 'Start local. Grow into the rest.',
    body: 'Begin with one store and observer(). Add history, persistence, sync or a Worker when the application asks for them, without rewriting the model.',
    start: 'Read the quick start',
    github: 'Star on GitHub',
    copy: 'Copy install command',
    copied: 'Copied'
  },
  zh: {
    title: '从本地开始，按需长出其余部分。',
    body: '先从一个 store 和 observer() 开始。等应用需要时，再加上撤销重做、持久化、同步或 Worker，模型无需重写。',
    start: '阅读快速上手',
    github: '在 GitHub 点星',
    copy: '复制安装命令',
    copied: '已复制'
  }
} as const;

export function CallToAction({ lang }: { lang: Locale }) {
  const text = copy[lang];
  return (
    <section className="cta" aria-labelledby="cta-title">
      <div className="cta__panel" data-reveal>
        <div className="cta__copy">
          <h2 id="cta-title">{text.title}</h2>
          <p>{text.body}</p>
          <div className="cta__actions">
            <Link
              className="button button--primary"
              href={localePath(lang, 'docs/getting-started/quick-start')}
            >
              {text.start}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a
              className="button cta__github"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              <GitHubIcon width={17} height={17} />
              {text.github}
            </a>
          </div>
          <div className="cta__install">
            <span aria-hidden="true">$</span>
            <code>{install}</code>
            <CopyButton
              text={install}
              label={text.copy}
              copiedLabel={text.copied}
            />
          </div>
        </div>
        <ExtrudedOctopus />
      </div>
    </section>
  );
}
