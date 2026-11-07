import { connection } from 'next/server';
import { ButtonLink } from '@/components/ui';

/** Rendered per request so its scripts carry the CSP nonce (a prerendered 404 would have its scripts blocked). */
export default async function NotFound() {
  await connection();
  return (
    <main id="main" className="relative grid min-h-dvh place-items-center overflow-hidden px-6 text-center">
      <div className="roi-aurora" aria-hidden />
      <div className="relative">
        <p className="font-mono text-7xl font-bold roi-gradient-text">404</p>
        <h1 className="mt-4 font-display text-3xl font-bold">This page doesn’t exist</h1>
        <p className="mt-2 text-[var(--color-muted)]">The link may be old or mistyped.</p>
        <div className="mt-8 flex justify-center gap-3"><ButtonLink href="/">Go home</ButtonLink><ButtonLink href="/products" variant="secondary">Browse products</ButtonLink></div>
      </div>
    </main>
  );
}
