'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Live updates (spec §2.1, Product 9): subscribes to /api/events (SSE backed by Postgres LISTEN/NOTIFY on the
 * always-on server). On serverless hosts SSE falls back to polling every 60 s. Each event triggers a server refresh.
 */
export function LiveRefresh({ channel }: { channel: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'live' | 'polling'>('live');
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      setMode('polling');
      timer = setInterval(() => router.refresh(), 60_000);
    };
    try {
      es = new EventSource(`/api/events?channel=${encodeURIComponent(channel)}`);
      es.addEventListener('change', () => router.refresh());
      es.addEventListener('fallback', () => {
        es?.close();
        startPolling();
      });
      es.onerror = () => {
        es?.close();
        if (!timer) startPolling();
      };
    } catch {
      startPolling();
    }
    return () => {
      es?.close();
      if (timer) clearInterval(timer);
    };
  }, [channel, router]);
  return <p className="mb-4 text-right text-xs text-[var(--color-muted)]">{mode === 'live' ? '● Live updates on' : '↻ Refreshing every 60 s'}</p>;
}
