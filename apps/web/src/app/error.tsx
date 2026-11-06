'use client';
export default function Error({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <main id="main" className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div>
        <p className="font-mono text-6xl font-bold text-[var(--color-danger)]">500</p>
        <h1 className="mt-4 font-display text-2xl font-bold">Something went wrong on our side</h1>
        <p className="mt-2 text-[var(--color-muted)]">The error was logged{error.digest ? ` (reference ${error.digest})` : ''}. Please try again.</p>
        <button onClick={reset} className="roi-gradient mt-6 rounded-full px-6 py-3 font-semibold text-white">Try again</button>
      </div>
    </main>
  );
}
