'use client';
import { useState } from 'react';

/** Direct-to-storage PDF upload with progress (spec Product 4): the server only hands out a short-lived upload URL. */
export function EbookUploader({ csrf }: { csrf: string }) {
  const [st, setSt] = useState<{ status: 'idle' | 'uploading' | 'done' | 'error'; pct?: number; key?: string; msg?: string; name?: string }>({ status: 'idle' });
  async function onFile(f?: File) {
    if (!f) return;
    if (f.type !== 'application/pdf') return setSt({ status: 'error', msg: 'Choose a PDF file.' });
    setSt({ status: 'uploading', pct: 0, name: f.name });
    const res = await fetch('/api/admin/ebooks/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ size: f.size, type: f.type }) });
    const j = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
    if (!res.ok || !j.url || !j.key) return setSt({ status: 'error', msg: j.error ?? 'Could not start the upload.' });
    await new Promise<void>((resolve) => {
      const x = new XMLHttpRequest();
      x.open('PUT', j.url!);
      x.setRequestHeader('Content-Type', 'application/pdf');
      x.upload.onprogress = (e) => e.lengthComputable && setSt((s) => ({ ...s, pct: Math.round((e.loaded / e.total) * 100) }));
      x.onload = () => {
        setSt(x.status >= 200 && x.status < 300 ? { status: 'done', key: j.key, name: f.name } : { status: 'error', msg: `Upload failed (HTTP ${x.status}). Check the storage CORS settings.` });
        resolve();
      };
      x.onerror = () => {
        setSt({ status: 'error', msg: 'Upload failed. Check your connection and the storage CORS settings.' });
        resolve();
      };
      x.send(f);
    });
  }
  return (
    <div>
      <label htmlFor="ebook-file" className="mb-1.5 block text-sm font-semibold">Book file (PDF)</label>
      <input id="ebook-file" type="file" accept="application/pdf" onChange={(e) => void onFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold" />
      <input type="hidden" name="sourceKey" value={st.key ?? ''} />
      <p role="status" aria-live="polite" className={`mt-2 text-sm ${st.status === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'}`}>
        {st.status === 'uploading' && `Uploading ${st.name}… ${st.pct ?? 0}%`}
        {st.status === 'done' && `✓ ${st.name} uploaded. It is validated and scanned after you save.`}
        {st.status === 'error' && st.msg}
        {st.status === 'idle' && 'Up to 200 MB. Encrypted PDFs and PDFs with scripts, launch actions or embedded files are rejected.'}
      </p>
    </div>
  );
}
