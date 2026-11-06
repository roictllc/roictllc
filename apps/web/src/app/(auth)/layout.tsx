import type { ReactNode } from 'react';
import Link from 'next/link';
import { Brand } from '@/components/ui';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="roi-aurora opacity-70" aria-hidden />
      <div className="roi-grid-bg absolute inset-0" aria-hidden />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Brand />
        <Link href="/" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">← Back to site</Link>
      </header>
      <main id="main" className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="roi-glass w-full max-w-md rounded-[var(--radius-xl)] p-8 sm:p-10">{children}</div>
      </main>
    </div>
  );
}
