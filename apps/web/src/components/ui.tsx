import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-7xl px-5 sm:px-8', className)}>{children}</div>;
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="roi-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00E5FF" />
          <stop offset="0.55" stopColor="#7B3FFF" />
          <stop offset="1" stopColor="#FF2D95" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#roi-g)" />
      <path d="M18 44 L28 30 L36 36 L47 20" stroke="#04050D" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47" cy="20" r="4.5" fill="#04050D" />
    </svg>
  );
}

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="ROI home">
      <LogoMark />
      <span className="font-display text-xl font-bold tracking-tight">ROI</span>
    </Link>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const btn = (v: BtnVariant, size: 'sm' | 'md' | 'lg') =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap',
    size === 'sm' && 'h-9 px-4 text-sm',
    size === 'md' && 'h-11 px-6 text-[15px]',
    size === 'lg' && 'h-14 px-8 text-base',
    v === 'primary' && 'roi-gradient text-white shadow-[0_0_32px_rgb(0_229_255/0.45)] hover:shadow-[0_0_44px_rgb(123_63_255/0.65)] hover:brightness-110',
    v === 'secondary' && 'border border-[var(--color-border)] bg-white/5 text-[var(--color-text)] hover:border-[var(--color-primary)] hover:bg-white/10',
    v === 'ghost' && 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/5',
    v === 'danger' && 'bg-[var(--color-danger)] text-white hover:brightness-110',
  );

export function ButtonLink({ href, variant = 'primary', size = 'md', children, className, ...rest }: { href: string; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; children: ReactNode; className?: string } & Omit<ComponentProps<typeof Link>, 'href'>) {
  return (
    <Link href={href} className={cx(btn(variant, size), className)} {...rest}>
      {children}
    </Link>
  );
}

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ComponentProps<'button'> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  return <button className={cx(btn(variant, size), className)} {...rest} />;
}

export function Card({ children, className, as: As = 'div', glow }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li'; glow?: boolean }) {
  return <As className={cx('roi-glass rounded-[var(--radius-lg)] p-6', glow && 'shadow-[0_0_48px_-12px_rgb(0_229_255/0.45)]', className)}>{children}</As>;
}

const pillColors = {
  success: 'border-[rgb(0_245_160/0.45)] bg-[rgb(0_245_160/0.12)] text-[var(--color-success)]',
  warning: 'border-[rgb(255_196_0/0.45)] bg-[rgb(255_196_0/0.12)] text-[var(--color-warning)]',
  danger: 'border-[rgb(255_77_94/0.5)] bg-[rgb(255_77_94/0.12)] text-[var(--color-danger)]',
  info: 'border-[rgb(0_229_255/0.45)] bg-[rgb(0_229_255/0.1)] text-[var(--color-primary)]',
  violet: 'border-[rgb(123_63_255/0.5)] bg-[rgb(123_63_255/0.14)] text-[#b69bff]',
  neutral: 'border-[var(--color-border)] bg-white/5 text-[var(--color-muted)]',
} as const;
export type PillTone = keyof typeof pillColors;

export function Pill({ tone = 'neutral', children, className }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide', pillColors[tone], className)}>{children}</span>;
}

export function statusTone(s: string): PillTone {
  const v = s.toUpperCase();
  if (['LIVE', 'CONNECTED', 'ACTIVE', 'PAID', 'COMPLETED', 'PUBLISHED', 'DELIVERED', 'SENT', 'RESOLVED', 'CLEAN', 'OK'].includes(v)) return 'success';
  if (['COMING_SOON', 'PENDING', 'PROCESSING', 'QUEUED', 'SCHEDULED', 'IN_PROGRESS', 'TRIALING', 'DRAFT', 'OPEN'].includes(v)) return 'info';
  if (['AWAITING_CONFIGURATION', 'WAITING_FOR_APPROVAL', 'PAST_DUE', 'PENDING_PAYMENT', 'WAITING_FOR_CUSTOMER', 'ESCALATED'].includes(v)) return 'warning';
  if (['FAILED', 'ERROR', 'DEAD', 'SUSPENDED', 'CANCELED', 'REFUNDED', 'INFECTED', 'HIDDEN'].includes(v)) return 'danger';
  return 'neutral';
}

export function LiveDot({ tone = 'success' }: { tone?: 'success' | 'info' }) {
  return <span aria-hidden className={cx('inline-block size-2 rounded-full animate-pulse-live', tone === 'success' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]')} />;
}

/** Live-data badge (spec §7): always shows source and age; never claims instant data. */
export function DataAge({ at, source }: { at: Date | string | null; source: string }) {
  if (!at) return <span className="text-xs text-[var(--color-muted)]">No data yet · source: {source}</span>;
  const s = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000));
  const age = s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
      <LiveDot tone={s < 300 ? 'success' : 'info'} /> updated {age} ago · source: {source}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, intro, center }: { eyebrow?: string; title: ReactNode; intro?: ReactNode; center?: boolean }) {
  return (
    <div className={cx('max-w-3xl', center && 'mx-auto text-center')}>
      {eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">{eyebrow}</p>}
      <h2 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {intro && <p className="mt-4 text-lg leading-relaxed text-[var(--color-muted)]">{intro}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'info', spark }: { label: string; value: ReactNode; hint?: ReactNode; tone?: PillTone; spark?: number[] }) {
  const color = tone === 'success' ? '#00F5A0' : tone === 'warning' ? '#FFC400' : tone === 'danger' ? '#FF4D5E' : tone === 'violet' ? '#7B3FFF' : '#00E5FF';
  const pts = spark && spark.length > 1 ? spark : null;
  const max = pts ? Math.max(...pts, 1) : 1;
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-mono text-3xl font-semibold tracking-tight">{value}</p>
        {pts && (
          <svg width="96" height="32" viewBox={`0 0 ${(pts.length - 1) * 10} 32`} aria-hidden>
            <polyline fill="none" stroke={color} strokeWidth="2" points={pts.map((v, i) => `${i * 10},${30 - (v / max) * 28}`).join(' ')} />
          </svg>
        )}
      </div>
      {hint && <p className="mt-2 text-sm text-[var(--color-muted)]">{hint}</p>}
    </Card>
  );
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  const c = { info: 'border-[rgb(0_229_255/0.4)] bg-[rgb(0_229_255/0.08)]', warning: 'border-[rgb(255_196_0/0.45)] bg-[rgb(255_196_0/0.08)]', danger: 'border-[rgb(255_77_94/0.5)] bg-[rgb(255_77_94/0.1)]', success: 'border-[rgb(0_245_160/0.45)] bg-[rgb(0_245_160/0.08)]' }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-[var(--radius-md)] border px-4 py-3 text-sm', c)}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={cx(title && 'mt-1', 'text-[var(--color-text)]/90')}>{children}</div>
    </div>
  );
}

const inputCls = 'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[rgb(4_5_13/0.55)] px-4 py-3 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]/70 transition focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-[rgb(0_229_255/0.15)]';

export function Field({ label, name, hint, error, children }: { label: string; name: string; hint?: string; error?: string; children?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p id={`${name}-hint`} className="text-xs text-[var(--color-muted)]">{hint}</p>}
      {error && <p id={`${name}-error`} className="text-xs font-medium text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} id={props.id ?? props.name} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} id={props.id ?? props.name} className={cx(inputCls, 'min-h-28', props.className)} />;
}
export function Select(props: ComponentProps<'select'>) {
  return <select {...props} id={props.id ?? props.name} className={cx(inputCls, 'appearance-none', props.className)} />;
}

export function Table({ head, rows, empty = 'Nothing here yet.' }: { head: ReactNode[]; rows: ReactNode[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-[var(--color-muted)]">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="px-4 py-10 text-center text-[var(--color-muted)]">{empty}</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-t border-[var(--color-border)]/60 hover:bg-white/[0.02]">
                {r.map((c, j) => <td key={j} className="px-4 py-3 align-middle">{c}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {intro && <p className="mt-2 max-w-2xl text-[var(--color-muted)]">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export { cx };
