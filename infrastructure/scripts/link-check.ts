/**
 * Link checker (spec §20): crawls the running site from the root, follows internal links, and checks external links
 * (two retries). Fails on any broken internal link or external link that never succeeds.
 * Usage: npm run link-check -- http://localhost:3000
 */
import { parse } from 'node-html-parser';

const base = new URL(process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000');
const seen = new Set<string>();
const queue = ['/'];
const broken: string[] = [];
const external = new Map<string, string>();
const skipExternal = process.env.LINKCHECK_SKIP_EXTERNAL === '1';

async function check(url: string, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'ROIBot-linkcheck/1.0' } });
      if (r.status < 400) return r;
      if (i === tries - 1) return r;
    } catch {
      if (i === tries - 1) return null;
    }
  }
  return null;
}

while (queue.length && seen.size < 500) {
  const path = queue.shift()!;
  if (seen.has(path)) continue;
  seen.add(path);
  const r = await check(new URL(path, base).toString(), 1);
  if (!r || r.status >= 400) {
    broken.push(`${path} → ${r?.status ?? 'unreachable'}`);
    continue;
  }
  if (!(r.headers.get('content-type') ?? '').includes('text/html')) continue;
  const root = parse(await r.text());
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')!;
    if (/^(mailto:|tel:|#|javascript:)/.test(href)) continue;
    const u = new URL(href, new URL(path, base));
    if (u.host === base.host) {
      const p = u.pathname;
      if (!/^\/(dashboard|admin|affiliate|account|api|checkout)/.test(p)) queue.push(p);
    } else external.set(u.toString(), path);
  }
}
if (!skipExternal) for (const [u, from] of external) {
  const r = await check(u, 3);
  if (!r || r.status >= 400) broken.push(`${u} (linked from ${from}) → ${r?.status ?? 'unreachable'}`);
}
console.log(`LINK_CHECK: ${broken.length ? 'FAILED' : 'OK'} (${seen.size} internal pages, ${external.size} external links)`);
for (const b of broken) console.log(`  ✗ ${b}`);
process.exit(broken.length ? 1 : 0);
