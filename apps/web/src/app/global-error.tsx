'use client';
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en-US"><body style={{ background: '#04050D', color: '#F2F6FF', fontFamily: 'system-ui', display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}><h1>Something went wrong</h1><button onClick={reset} style={{ marginTop: 16, padding: '12px 24px', borderRadius: 999, border: 0, background: '#7B3FFF', color: '#fff' }}>Try again</button></div>
    </body></html>
  );
}
