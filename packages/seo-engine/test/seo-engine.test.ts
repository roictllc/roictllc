import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertSafeUrl, isBlockedIp, robotsAllows, safeFetch, SsrfError } from '../src/safe-fetch';
import { runAiVisibilityAudit } from '../src/ai-visibility';

describe('SSRF defense (spec §6, §21 security tests)', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '224.0.0.1'])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public %s', (ip) => expect(isBlockedIp(ip)).toBe(false));
  it.each([
    'file:///etc/passwd', 'gopher://x', 'http://user:pass@example.com', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/',
    'http://localhost/', 'http://metadata.google.internal/', 'http://example.com:8080/', 'http://10.0.0.1/',
  ])('rejects %s', (u) => expect(() => assertSafeUrl(u)).toThrow(SsrfError));
  it('rejects hostnames that resolve to private IPs at connect time (DNS rebinding defense)', async () => {
    // localtest.me style names may not resolve offline; use a literal that DNS maps to loopback.
    await expect(safeFetch('http://127.0.0.1.nip.io/')).rejects.toThrow();
  });
});

describe('robots.txt evaluation', () => {
  const robots = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nAllow: /admin/public\n`;
  it('applies agent-specific groups and longest match', () => {
    expect(robotsAllows(robots, 'GPTBot', '/')).toBe(false);
    expect(robotsAllows(robots, 'ClaudeBot', '/')).toBe(true);
    expect(robotsAllows(robots, 'ClaudeBot', '/admin/x')).toBe(false);
    expect(robotsAllows(robots, 'ClaudeBot', '/admin/public/page')).toBe(true);
  });
});

describe('AI Visibility audit scoring (golden sites)', () => {
  let server: Server;
  let base = '';
  const good = `<!doctype html><html lang="en-US"><head><title>Bayview Family Dental — Dentist in Tampa</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="Bayview Family Dental is a family dentist in Tampa, FL offering cleanings, fillings, crowns and Saturday appointments for new patients.">
<link rel="canonical" href="https://bayview.example/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Bayview Family Dental","telephone":"+1-813-555-0100","address":{"@type":"PostalAddress","streetAddress":"100 Harbor St","addressLocality":"Tampa","addressRegion":"FL"},"sameAs":["https://www.yelp.com/biz/bayview","https://www.facebook.com/bayview"],"makesOffer":[{"@type":"Offer","itemOffered":{"@type":"Service","name":"Teeth cleaning"}}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}</script></head>
<body><main><h1>Bayview Family Dental</h1>
<p>Bayview Family Dental is a family dentist in Tampa, Florida, caring for children and adults with cleanings, fillings, crowns and emergency visits. We accept new patients, most PPO insurance plans and offer Saturday appointments at 100 Harbor St, a short drive from downtown Tampa.</p>
<h2>How much does a cleaning cost?</h2><p>${'Our prices are listed clearly. '.repeat(60)}</p><h2>Do you take new patients?</h2><p>Yes.</p><h2>What insurance do you accept?</h2><p>Most PPO plans.</p>
<table><tr><td>Cleaning</td><td>$99</td></tr></table><p>Read our reviews: rated 4.9 stars by patients.</p>
<a href="tel:+18135550100">(813) 555-0100</a><a href="https://maps.app.goo.gl/abc">Google</a><a href="https://www.yelp.com/biz/bayview">Yelp</a><a href="https://www.facebook.com/bayview">Facebook</a>
</main></body></html>`;
  const bad = `<html><head><title>Home</title></head><body><div>Welcome to our website</div></body></html>`;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const site = req.headers.host?.startsWith('good') || req.url?.startsWith('/good') ? 'good' : 'bad';
      const path = (req.url ?? '/').replace(/^\/(good|bad)/, '') || '/';
      if (path === '/robots.txt') return res.end(site === 'good' ? 'User-agent: *\nAllow: /\nSitemap: /sitemap.xml' : 'User-agent: GPTBot\nDisallow: /\nUser-agent: ClaudeBot\nDisallow: /');
      if (path === '/llms.txt') return site === 'good' ? res.end('# Bayview Family Dental\nFamily dentist in Tampa, FL. Services: cleanings, fillings, crowns.') : (res.statusCode = 404, res.end());
      if (path === '/sitemap.xml') return site === 'good' ? res.end('<?xml version="1.0"?><urlset><url><loc>/</loc></url></urlset>') : (res.statusCode = 404, res.end());
      res.setHeader('content-type', 'text/html');
      res.end(site === 'good' ? good : bad);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server.close());

  // Golden-site fetcher: same parsing path, served from fixtures (the SSRF client is tested above).
  const fixtureFetcher = (prefix: string) => async (url: string) => {
    const u = new URL(url);
    const r = await fetch(`${base}/${prefix}${u.pathname}`);
    return { url: `https://${prefix}.example${u.pathname}`, status: r.status, headers: {}, body: await r.text(), bytes: 0, redirects: [], timeMs: 120 };
  };

  it('scores a well-prepared site high', async () => {
    const r = await runAiVisibilityAudit({ businessName: 'Bayview Family Dental', url: 'https://good.example/', city: 'Tampa', category: 'family dentist' }, fixtureFetcher('good'));
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.fetched).toMatchObject({ robots: true, llms: true, sitemap: true });
  });
  it('scores a bare site low and lists prioritized fixes', async () => {
    const r = await runAiVisibilityAudit({ businessName: 'Acme Plumbing', url: 'https://bad.example/', city: 'Austin', category: 'plumber' }, fixtureFetcher('bad'));
    expect(r.score).toBeLessThan(25);
    expect(r.fixes[0].impact).toBe(3);
    expect(r.checks.find((c) => c.id === 'ai-crawlers-allowed')?.detail).toContain('GPTBot');
    expect(r.fixes.map((f) => f.id)).toContain('org-schema');
  });
});
