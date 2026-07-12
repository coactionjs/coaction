import Link from 'next/link';
import { CoactionMark } from '@/components/logo';

export default function LanguageGate() {
  return (
    <main className="language-gate">
      <section className="language-gate__card">
        <CoactionMark className="language-gate__mark" />
        <h1>Coaction</h1>
        <p>
          State that follows your reads. Choose a language to explore the
          documentation.
          <br />
          状态随读取而动。请选择文档语言。
        </p>
        <div className="language-gate__actions">
          <Link href="/en">English</Link>
          <Link href="/zh">简体中文</Link>
        </div>
      </section>
    </main>
  );
}
