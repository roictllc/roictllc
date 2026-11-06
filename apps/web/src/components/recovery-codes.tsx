'use client';
import { useState } from 'react';

export function RecoveryCodes({ codes, next }: { codes: string[]; next: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-[rgb(255_196_0/0.45)] bg-[rgb(255_196_0/0.06)] p-5">
      <p className="font-semibold">Save your recovery codes</p>
      <p className="text-sm text-[var(--color-muted)]">Each code works once if you lose your phone. They will not be shown again.</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((c) => <li key={c} className="rounded-md bg-black/30 px-3 py-1.5 text-center">{c}</li>)}</ul>
      <div className="flex gap-3">
        <button type="button" onClick={async () => { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); }} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm hover:border-[var(--color-primary)]">{copied ? 'Copied ✓' : 'Copy codes'}</button>
        <a href={next} className="roi-gradient rounded-full px-5 py-2 text-sm font-semibold text-white">I saved them — continue</a>
      </div>
    </div>
  );
}
