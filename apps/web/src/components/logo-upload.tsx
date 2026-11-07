'use client';
import { useRef, useState } from 'react';

/**
 * Logo upload field (Products 1–2): sends the file to /api/uploads/logo (scan + validation happen on the server),
 * then keeps only the returned asset id in a hidden input. Client checks mirror the server limits for fast feedback.
 */
export function LogoUpload({ product, csrf, minSide, error, label = 'Your logo' }: { product: 'animated-gif-logo' | 'logo-revival' | 'email-signature-suite'; csrf: string; minSide: number; error?: string; label?: string }) {
  const [state, setState] = useState<{ status: 'idle' | 'uploading' | 'done' | 'error'; message?: string; assetId?: string; preview?: string; dims?: string }>({ status: 'idle' });
  const input = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!['image/png', 'image/jpeg'].includes(f.type)) return setState({ status: 'error', message: 'Choose a PNG or JPG file.' });
    if (f.size > 10 * 1024 * 1024) return setState({ status: 'error', message: 'The file is larger than 10 MB.' });
    const preview = URL.createObjectURL(f);
    setState({ status: 'uploading', preview });
    const body = new FormData();
    body.set('file', f);
    try {
      const res = await fetch(`/api/uploads/logo?product=${product}`, { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body });
      const j = (await res.json().catch(() => ({}))) as { assetId?: string; width?: number; height?: number; error?: string };
      if (!res.ok || !j.assetId) return setState({ status: 'error', preview, message: j.error ?? 'Upload failed. Please try again.' });
      setState({ status: 'done', preview, assetId: j.assetId, dims: `${j.width}×${j.height} px` });
    } catch {
      setState({ status: 'error', preview, message: 'Could not reach the server. Check your connection.' });
    }
  }

  return (
    <div>
      <label htmlFor="logo-file" className="mb-1.5 block text-sm font-semibold">{label}</label>
      <div
        className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border)] bg-white/[0.02] p-6 text-center transition hover:border-[var(--color-primary)]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFile(e.dataTransfer.files[0]);
        }}
      >
        {state.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.preview} alt="Your uploaded logo" className="max-h-32 max-w-full rounded-lg bg-[repeating-conic-gradient(#2a2f45_0%_25%,#1a1e2e_0%_50%)] bg-[length:16px_16px] object-contain p-2" />
        ) : (
          <span aria-hidden className="text-4xl">⬆</span>
        )}
        <p className="text-sm text-[var(--color-muted)]">PNG or JPG, up to 10 MB, shortest side at least {minSide} px. Drag it here or</p>
        <button type="button" onClick={() => input.current?.click()} className="rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm font-semibold hover:border-[var(--color-primary)]">Choose a file</button>
        <input ref={input} id="logo-file" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      <input type="hidden" name="logoAssetId" value={state.assetId ?? ''} />
      <p role="status" aria-live="polite" className={`mt-2 text-sm ${state.status === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'}`}>
        {state.status === 'uploading' && 'Uploading and scanning…'}
        {state.status === 'done' && `✓ Uploaded and scanned clean (${state.dims}).`}
        {state.status === 'error' && state.message}
        {state.status === 'idle' && error}
      </p>
    </div>
  );
}
