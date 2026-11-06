'use client';
import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string; citations?: Array<{ title: string; url: string }> };

/** Built-in ROI assistant (spec §13): answers from ROI's own knowledge base, no external AI API. */
export function AssistantChat({ csrf, inline = false }: { csrf: string; inline?: boolean }) {
  const [open, setOpen] = useState(inline);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', content: 'Hi! I’m the ROI assistant. Ask me about getting recommended by AI, social autopilot, websites, prices or your orders.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Block body: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText('');
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ message: q, conversationId }) });
      const data = (await res.json()) as { answer?: string; citations?: Msg['citations']; conversationId?: string; error?: string };
      if (data.conversationId) setConversationId(data.conversationId);
      setMsgs((m) => [...m, { role: 'assistant', content: data.answer ?? data.error ?? 'Sorry, something went wrong.', citations: data.citations }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'I could not reach the server. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <div className={`roi-glass flex flex-col overflow-hidden rounded-[var(--radius-xl)] ${inline ? 'h-[520px]' : 'h-[min(560px,75dvh)] w-[min(400px,calc(100vw-2rem))]'}`} role="dialog" aria-label="ROI assistant">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <p className="font-display font-semibold"><span className="roi-gradient-text">ROI</span> Assistant</p>
        {!inline && <button onClick={() => setOpen(false)} className="rounded-full px-2 text-[var(--color-muted)] hover:text-[var(--color-text)]" aria-label="Close assistant">✕</button>}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-8 rounded-2xl rounded-br-sm bg-[rgb(123_63_255/0.35)] px-4 py-2.5 text-sm' : 'mr-6 rounded-2xl rounded-bl-sm bg-white/5 px-4 py-2.5 text-sm leading-relaxed'}>
            <p className="whitespace-pre-line">{m.content}</p>
            {m.citations && m.citations.length > 0 && (
              <p className="mt-2 text-xs text-[var(--color-muted)]">Sources: {m.citations.map((c, j) => <a key={j} href={c.url} className="mr-2 text-[var(--color-primary)] hover:underline">{c.title}</a>)}</p>
            )}
          </div>
        ))}
        {busy && <p className="text-xs text-[var(--color-muted)]">Thinking…</p>}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-[var(--color-border)] p-3">
        <label htmlFor="assistant-input" className="sr-only">Ask the ROI assistant</label>
        <input id="assistant-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ask anything about ROI…" className="flex-1 rounded-full border border-[var(--color-border)] bg-black/30 px-4 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
        <button type="submit" disabled={busy} className="roi-gradient rounded-full px-4 text-sm font-semibold text-white disabled:opacity-50">Send</button>
      </form>
    </div>
  );

  if (inline) return panel;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && panel}
      {!open && (
        <button onClick={() => setOpen(true)} className="roi-gradient flex h-14 items-center gap-2 rounded-full px-5 font-semibold text-white shadow-[0_0_36px_rgb(123_63_255/0.6)]" aria-label="Open ROI assistant">
          <span aria-hidden>✦</span> Ask ROI
        </button>
      )}
    </div>
  );
}
