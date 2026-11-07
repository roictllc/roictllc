import Link from 'next/link';
import { Brand, ButtonLink, Container } from './ui';
import { getSession, homeFor } from '@/server/session';

const NAV = [
  { href: '/ai-visibility', label: 'AI Visibility', highlight: true },
  { href: '/products', label: 'Products' },
  { href: '/websites', label: 'Websites' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/guides', label: 'Guides' },
];

export async function SiteHeader() {
  const s = await getSession().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)]/60 bg-[rgb(4_5_13/0.72)] backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Brand />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`rounded-full px-3.5 py-2 text-sm font-medium transition hover:bg-white/5 hover:text-[var(--color-text)] ${n.highlight ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]'}`}>
              {n.highlight && <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-[var(--color-primary)] align-middle shadow-[0_0_10px_#00E5FF]" />}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {s ? (
            <ButtonLink href={homeFor(s.user.role)} size="sm">Open dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</ButtonLink>
              <ButtonLink href="/ai-visibility#audit" size="sm">Free AI audit</ButtonLink>
            </>
          )}
        </div>
      </Container>
      <nav aria-label="Main mobile" className="flex gap-1 overflow-x-auto border-t border-[var(--color-border)]/40 px-4 py-2 lg:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-full px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">{n.label}</Link>
        ))}
      </nav>
    </header>
  );
}

const FOOTER = [
  { title: 'Grow', links: [['AI Visibility', '/ai-visibility'], ['SEO & Local', '/seo-local'], ['AI for business', '/ai-for-business']] },
  { title: 'Build', links: [['Websites & hosting', '/websites'], ['Animated GIF logo', '/products/animated-gif-logo'], ['Logo generator', '/products/logo-generator'], ['Email signatures', '/products/email-signature-suite'], ['E-book library', '/ebooks']] },
  { title: 'Company', links: [['About', '/about'], ['Pricing', '/pricing'], ['Guides', '/guides'], ['FAQ', '/faq'], ['Contact', '/contact'], ['Status', '/status']] },
  { title: 'Legal', links: [['Privacy', '/legal/privacy'], ['Terms', '/legal/terms'], ['Refund policy', '/legal/refund-policy'], ['Acceptable use', '/legal/acceptable-use'], ['Takedown (DMCA)', '/legal/takedown'], ['Cookies', '/legal/cookies']] },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-[var(--color-border)]/60">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Brand />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--color-muted)]">Your Investment. Our Intelligence. Measurable Growth. ROI LLC serves small businesses across the United States.</p>
          <p className="mt-4 text-sm"><a className="text-[var(--color-primary)] hover:underline" href="mailto:roictllc@gmail.com">roictllc@gmail.com</a></p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map(([label, href]) => (
                <li key={href}><Link href={href} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <Container className="flex flex-col gap-2 border-t border-[var(--color-border)]/40 py-6 text-xs text-[var(--color-muted)] sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} ROI LLC. All rights reserved.</p>
        <p>No guaranteed rankings, mentions or results — we measure and report honestly.</p>
      </Container>
    </footer>
  );
}
