import type { Locale } from '@/lib/i18n';
import { HighlightedCode, methodLines } from './highlighted-code';
import { Playground } from './playground';
import { SectionHeader } from './section';

const storeCode = `import { create } from '@coaction/react';

export const useShop = create((set) => ({
  user: { name: 'Ada', age: 36 },
  cart: { items: [{ name: 'Notebook', price: 12 }] },
  theme: 'light',

  get total() {
    return this.cart.items.reduce((sum, item) => sum + item.price, 0);
  },

  rename(name: string) {
    set(() => {
      this.user.name = name;
    });
  },
  birthday() {
    set(() => {
      this.user.age += 1;
    });
  },
  addItem(item: Item) {
    set(() => {
      this.cart.items.push(item);
    });
  },
  setTheme(theme: 'light' | 'dark') {
    set(() => {
      this.theme = theme;
    });
  }
}));`;

const componentsCode = `import { observer } from '@coaction/react';
import { useShop } from './store';

// Left column: re-renders only when user.age changes.
export const AgeBadge = observer(() => {
  const shop = useShop();
  return <span>{shop.user.age}</span>;
});

// Right column: without observer() the hook subscribes
// to the whole store and re-renders on every commit.
export function AgeBadgeWhole() {
  const shop = useShop();
  return <span>{shop.user.age}</span>;
}`;

const copy = {
  en: {
    eyebrow: 'Live playground',
    title: (
      <>
        Click an action. <em>Count the re-renders.</em>
      </>
    ),
    lede: 'This is the Coaction in this repository, running in your browser. Every cell is a component that counts its own renders: wrapped in observer() on the left, a plain useShop() that subscribes to the whole store on the right.'
  },
  zh: {
    eyebrow: '实时演示',
    title: (
      <>
        点一个 action，<em>数一数重渲染。</em>
      </>
    ),
    lede: '这里运行的就是本仓库里的 Coaction。每个单元格都是一个会统计自身渲染次数的组件：左列用 observer() 包裹，右列是订阅整个 store 的普通 useShop()。'
  }
} as const;

export function PlaygroundSection({ lang }: { lang: Locale }) {
  const text = copy[lang];
  const marks = {
    total: methodLines(storeCode, 'get total'),
    rename: methodLines(storeCode, 'rename'),
    birthday: methodLines(storeCode, 'birthday'),
    addItem: methodLines(storeCode, 'addItem'),
    setTheme: methodLines(storeCode, 'setTheme')
  };

  return (
    <section className="section" aria-labelledby="playground-title">
      <SectionHeader
        id="playground-title"
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
      />
      <Playground
        lang={lang}
        code={{
          store: <HighlightedCode code={storeCode} lang="ts" marks={marks} />,
          components: <HighlightedCode code={componentsCode} lang="tsx" />
        }}
      />
    </section>
  );
}
