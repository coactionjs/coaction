import { zhCN } from '@fumadocs/language/zh-cn';
import { uiTranslations } from 'fumadocs-ui/i18n';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { CoactionLogo } from '@/components/logo';
import { i18n, type Locale } from './i18n';
import { githubUrl, localePath } from './site';

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .preset('zh', zhCN());

export function baseOptions(locale: Locale): BaseLayoutProps {
  return {
    githubUrl,
    nav: {
      title: <CoactionLogo />,
      url: localePath(locale)
    },
    links: [
      {
        text: locale === 'zh' ? '文档' : 'Docs',
        url: localePath(locale, 'docs'),
        active: 'nested-url'
      },
      {
        text: locale === 'zh' ? '示例' : 'Examples',
        url: `${githubUrl}/tree/main/examples`,
        external: true
      }
    ]
  };
}
