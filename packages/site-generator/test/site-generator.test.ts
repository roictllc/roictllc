import { describe, expect, it } from 'vitest';
import { generateSite, generateUniqueSite, PACKS, qualityGate, shingleSimilarity, type SiteInput } from '../src';

const CITIES = [['Tampa', 'FL'], ['Austin', 'TX'], ['Denver', 'CO'], ['Columbus', 'OH'], ['Phoenix', 'AZ'], ['Raleigh', 'NC'], ['Boise', 'ID'], ['Omaha', 'NE']];
const mk = (i: number, industry: string): SiteInput => ({
  siteId: `site${i}`, businessName: `${['Summit', 'Harbor', 'Pioneer', 'Oak', 'Bright', 'Metro', 'Liberty', 'Evergreen'][i % 8]} ${PACKS[industry].label} ${i}`, industry,
  description: `A locally owned ${PACKS[industry].label.toLowerCase()} business number ${i} focused on great service.`, services: [{ name: 'Consultation', description: 'A first conversation to understand what you need.' }, { name: `Core service ${i % 5}`, description: 'Our main service, delivered carefully and on time.', priceCents: 9900 }],
  phone: '(813) 555-0100', email: `hello${i}@example.com`, address: `${100 + i} Main St`, city: CITIES[i % 8][0], state: CITIES[i % 8][1], serviceAreas: [CITIES[i % 8][0], 'Nearby towns'], colors: ['#2563EB', '#7B3FFF'],
  design: (['aurora', 'classic', 'bold', 'clean', 'warm'] as const)[i % 5], ctaGoal: (['call', 'form', 'booking'] as const)[i % 3], bookingUrl: 'https://cal.example.com/x', apiOrigin: 'https://roictllc.com',
});

describe('site generator (Product 5)', () => {
  it('has ≥ 20 industry packs', () => expect(Object.keys(PACKS).length).toBeGreaterThanOrEqual(20));
  it.each(Object.keys(PACKS))('industry %s passes the quality gate', (industry) => {
    const site = generateSite(mk(1, industry));
    const q = qualityGate(site, mk(1, industry));
    expect(q.problems).toEqual([]);
    expect(site.files['sitemap.xml']).toContain('<urlset');
    expect(site.files['index.html']).toContain(`"@type":"${PACKS[industry].schemaType}"`);
    expect(site.files['contact/index.html']).toContain('/api/sites/site1/contact');
  });
  it('preview generation p95 ≤ 5 s (in practice milliseconds)', () => {
    const times = Array.from({ length: 40 }, (_, i) => generateSite(mk(i, Object.keys(PACKS)[i % 22])).ms).sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(5000);
  });
  it('100 generated sites: no pair of different businesses publishes near-identical home text', () => {
    const sites: ReturnType<typeof generateSite>[] = [];
    let reviews = 0;
    for (let i = 0; i < 100; i++) {
      const r = generateUniqueSite(mk(i, Object.keys(PACKS)[i % 22]), sites.map((s) => s.homeText));
      if (r.needsManagerReview) reviews++;
      else sites.push(r.site);
    }
    expect(reviews).toBe(0);
    let worst = 0;
    for (let a = 0; a < sites.length; a++) for (let b = a + 1; b < sites.length; b++) worst = Math.max(worst, shingleSimilarity(sites[a].homeText, sites[b].homeText));
    expect(worst).toBeLessThan(0.5);
  });
  it('gate catches leftover tokens, broken links and claims', () => {
    const site = generateSite(mk(2, 'dentist'));
    site.files['about/index.html'] = site.files['about/index.html'].replace('</main>', '<p>{name} guaranteed results <a href="/missing/">x</a></p></main>');
    const q = qualityGate(site, mk(2, 'dentist'));
    expect(q.ok).toBe(false);
    expect(q.problems.join(' ')).toMatch(/template token/);
    expect(q.problems.join(' ')).toMatch(/broken internal link/);
    expect(q.problems.join(' ')).toMatch(/claim/);
  });
});
