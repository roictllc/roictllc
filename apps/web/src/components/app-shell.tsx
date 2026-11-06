import Link from 'next/link';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Brand, Pill } from './ui';
import { CsrfField } from './csrf-field';
import { logoutAction } from '@/server/actions/auth';

export type NavItem = { href: string; label: string; badge?: string };
export type NavGroup = { title?: string; items: NavItem[] };

export async function AppShell({ groups, user, area, children }: { groups: NavGroup[]; user: { name: string | null; email: string; role: string }; area: string; children: ReactNode }) {
  const path = (await headers()).get('x-pathname') ?? '';
  const isActive = (href: string) => (href === '/admin' || href === '/dashboard' || href === '/affiliate' ? path === href : path.startsWith(href));
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-[var(--color-border)]/70 bg-[rgb(7_10_24/0.85)] backdrop-blur-xl lg:flex">
        <div className="flex items-center justify-between px-6 py-5">
          <Brand href={groups[0]?.items[0]?.href ?? '/'} />
          <Pill tone="violet">{area}</Pill>
        </div>
        <nav aria-label={`${area} navigation`} className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {groups.map((g, i) => (
            <div key={i}>
              {g.title && <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]/80">{g.title}</p>}
              <ul className="space-y-0.5">
                {g.items.map((it) => (
                  <li key={it.href}>
                    <Link href={it.href} aria-current={isActive(it.href) ? 'page' : undefined}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${isActive(it.href) ? 'bg-[linear-gradient(90deg,rgb(0_229_255/0.18),rgb(123_63_255/0.12))] font-semibold text-[var(--color-text)] shadow-[inset_2px_0_0_#00E5FF]' : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]'}`}>
                      {it.label}
                      {it.badge && <span className="rounded-full bg-[var(--color-warning)]/20 px-2 text-[11px] font-semibold text-[var(--color-warning)]">{it.badge}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-[var(--color-border)]/60 p-4">
          <p className="truncate text-sm font-semibold">{user.name ?? user.email}</p>
          <p className="truncate text-xs text-[var(--color-muted)]">{user.email} · {user.role}</p>
          <div className="mt-3 flex gap-2">
            <Link href="/" className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-primary)]">View site</Link>
            <form action={logoutAction}><CsrfField /><button className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-danger)]">Sign out</button></form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--color-border)]/60 px-5 py-3 lg:hidden">
          <Brand />
          <form action={logoutAction}><CsrfField /><button className="text-sm text-[var(--color-muted)]">Sign out</button></form>
        </header>
        <nav aria-label="Section" className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]/40 px-3 py-2 lg:hidden">
          {groups.flatMap((g) => g.items).map((it) => <Link key={it.href} href={it.href} className="shrink-0 rounded-full px-3 py-1.5 text-sm text-[var(--color-muted)]">{it.label}</Link>)}
        </nav>
        <main id="main" className="relative flex-1 px-5 py-8 sm:px-8 lg:px-10">
          <div className="roi-aurora opacity-25" aria-hidden />
          <div className="relative mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
