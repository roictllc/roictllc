import { parse } from 'node-html-parser';
import { lintClaims } from '../../shared-utils/src/claims';
import { CTA_TEXT, OPENERS, PACKS, SUBHEADS, type Pack } from './packs';

/**
 * Product 5 generator (spec §12): static, accessible, SEO-ready HTML/CSS with minimal JS. Pages: Home, About,
 * Services (+ one per service), Contact, FAQ, Privacy, Terms, 404, Thank-you; sitemap, robots, JSON-LD
 * (LocalBusiness subtype, Service, FAQPage, BreadcrumbList), Open Graph. Contact form posts to ROI.
 */
export interface SiteInput {
  siteId: string;
  businessName: string;
  industry: string;
  description: string;
  tagline?: string;
  services: Array<{ name: string; description: string; priceCents?: number }>;
  phone: string;
  email: string;
  address?: string;
  city: string;
  state: string;
  hours?: string;
  serviceAreas: string[];
  colors: string[];
  design: 'aurora' | 'classic' | 'bold' | 'clean' | 'warm';
  ctaGoal: 'call' | 'form' | 'booking';
  bookingUrl?: string;
  social?: Record<string, string>;
  testimonials?: Array<{ quote: string; author: string }>;
  licenses?: string;
  logoUrl?: string;
  domain?: string;
  apiOrigin: string; // e.g. https://roictllc.com
}

export interface GeneratedSite {
  files: Record<string, string>;
  pages: string[];
  ms: number;
  homeText: string;
}

const esc = (s = '') => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'service';
function picker(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return <T,>(xs: readonly T[]) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return xs[(h >>> 0) % xs.length];
  };
}

const THEMES = {
  aurora: { bg: '#0B1024', fg: '#F2F6FF', muted: '#C9D3EE', card: '#141B36', font: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
  classic: { bg: '#FFFFFF', fg: '#1F2937', muted: '#4B5563', card: '#F3F4F6', font: 'Georgia, "Times New Roman", serif' },
  bold: { bg: '#111111', fg: '#FFFFFF', muted: '#D1D5DB', card: '#1F1F1F', font: 'Impact, "Arial Black", system-ui, sans-serif' },
  clean: { bg: '#F8FAFC', fg: '#0F172A', muted: '#475569', card: '#FFFFFF', font: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
  warm: { bg: '#FFF8F1', fg: '#3B2416', muted: '#6B4A36', card: '#FFFFFF', font: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
};

function css(i: SiteInput) {
  const t = THEMES[i.design];
  const p = i.colors[0] ?? '#2563EB';
  return `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:${t.bg};color:${t.fg};font:16px/1.6 ${t.font}}a{color:${p}}img{max-width:100%;height:auto}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}header{border-bottom:1px solid rgba(127,127,127,.25)}header .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px}
.brand{font-weight:800;font-size:20px;color:${t.fg};text-decoration:none}nav a{margin-left:16px;color:${t.fg};text-decoration:none}nav a:hover{text-decoration:underline}
.hero{padding:72px 0 56px}.hero h1{font-size:clamp(32px,5vw,52px);line-height:1.1;margin:0 0 16px}.hero p{font-size:19px;color:${t.muted};max-width:680px}
.btn{display:inline-block;background:${p};color:#fff;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:700;border:0;font-size:16px;cursor:pointer}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{background:${t.card};border-radius:16px;padding:22px}section{padding:40px 0}
h2{font-size:28px;margin:0 0 16px}label{display:block;font-weight:600;margin:12px 0 4px}input,textarea{width:100%;padding:12px;border-radius:10px;border:1px solid #9CA3AF;font:inherit;background:#fff;color:#111}
footer{border-top:1px solid rgba(127,127,127,.25);padding:28px 0;color:${t.muted};font-size:14px}.sr{position:absolute;left:-9999px}.skip:focus{left:12px;top:12px;position:fixed;background:#fff;color:#000;padding:8px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`;
}

export function generateSite(i: SiteInput, seed = i.siteId): GeneratedSite {
  const t0 = performance.now();
  const pack: Pack = PACKS[i.industry] ?? PACKS['marketing-agency'];
  const pick = picker(`${seed}:${i.businessName}`);
  const verb = pick(pack.verbs);
  const areas = i.serviceAreas.length ? i.serviceAreas.slice(0, 4).join(', ') : `${i.city} and nearby`;
  const vars: Record<string, string> = { name: i.businessName, verb, label: pack.label, label_lc: pack.label.toLowerCase(), city: i.city, state: i.state, customer: pack.customer, areas, services: i.services.slice(0, 3).map((s) => s.name.toLowerCase()).join(', '), phone: i.phone };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const base = i.domain ? `https://${i.domain}` : `${i.apiOrigin}/sites/${i.siteId}`;
  const ctaHref = i.ctaGoal === 'call' ? `tel:${i.phone.replace(/[^+\d]/g, '')}` : i.ctaGoal === 'booking' && i.bookingUrl ? i.bookingUrl : '/contact/';
  const cta = fill(pick(CTA_TEXT[i.ctaGoal]));
  const navItems = [['/', 'Home'], ['/services/', 'Services'], ['/about/', 'About'], ['/faq/', 'FAQ'], ['/contact/', 'Contact']];
  const faqs = pack.faqs.map(([q, a]) => ({ q, a }));
  const ld = {
    '@context': 'https://schema.org', '@type': pack.schemaType, '@id': `${base}/#business`, name: i.businessName, description: i.description, url: `${base}/`, telephone: i.phone, email: i.email,
    address: i.address ? { '@type': 'PostalAddress', streetAddress: i.address, addressLocality: i.city, addressRegion: i.state, addressCountry: 'US' } : { '@type': 'PostalAddress', addressLocality: i.city, addressRegion: i.state, addressCountry: 'US' },
    areaServed: (i.serviceAreas.length ? i.serviceAreas : [i.city]).map((a) => ({ '@type': 'City', name: a })),
    ...(i.hours ? { openingHours: i.hours } : {}), ...(i.logoUrl ? { logo: i.logoUrl } : {}), sameAs: Object.values(i.social ?? {}).filter((u) => /^https:\/\//.test(u)),
    makesOffer: i.services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name, description: s.description }, ...(s.priceCents ? { price: (s.priceCents / 100).toFixed(2), priceCurrency: 'USD' } : {}) })),
  };
  const page = (path: string, title: string, description: string, body: string, extraLd: object[] = []) => {
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` }, ...(path !== '/' ? [{ '@type': 'ListItem', position: 2, name: title, item: `${base}${path}` }] : [])] };
    return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description.slice(0, 160))}"><link rel="canonical" href="${base}${path}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description.slice(0, 200))}"><meta property="og:url" content="${base}${path}"><meta property="og:image" content="${base}/og.png"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify([ld, crumbs, ...extraLd]).replace(/</g, '\\u003c')}</script></head>
<body><a class="sr skip" href="#main">Skip to content</a><header><div class="wrap"><a class="brand" href="/">${esc(i.businessName)}</a><nav aria-label="Main">${navItems.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav></div></header>
<main id="main">${body}</main><footer><div class="wrap"><p><strong>${esc(i.businessName)}</strong> · ${esc([i.address, `${i.city}, ${i.state}`].filter(Boolean).join(', '))} · <a href="tel:${i.phone.replace(/[^+\d]/g, '')}">${esc(i.phone)}</a> · <a href="mailto:${esc(i.email)}">${esc(i.email)}</a></p>
<p><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a>${i.licenses ? ` · ${esc(i.licenses)}` : ''}</p><p>© ${new Date().getUTCFullYear()} ${esc(i.businessName)}. Site by ROI.</p></div></footer></body></html>`;
  };

  const servicesCards = i.services.map((s) => `<div class="card"><h3><a href="/services/${slug(s.name)}/">${esc(s.name)}</a></h3><p>${esc(s.description)}</p>${s.priceCents ? `<p><strong>From $${(s.priceCents / 100).toFixed(0)}</strong></p>` : ''}</div>`).join('');
  const shuffle = <T,>(xs: T[]) => xs.map((x) => [pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const LEADS = ['For {customer} in {city}:', 'Here in {city}:', 'At {name}:', 'Across {areas}:', 'Every visit:'];
  const benefits = shuffle(pack.benefits).slice(0, 2 + (pick([0, 1]) as number)).map(([h, d]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(fill(pick(LEADS)))} ${esc(d)}</p></div>`).join('');
  const faqHtml = faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('');
  const homeFaqHtml = shuffle(faqs).slice(0, 2).map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)} ${esc(fill(pick(['Call {phone} to ask {name} directly.', 'Questions? {name} is happy to help.', 'Serving {areas}.'])))}</p>`).join('');
  const testimonials = (i.testimonials ?? []).map((t) => `<figure class="card"><blockquote>“${esc(t.quote)}”</blockquote><figcaption>— ${esc(t.author)}</figcaption></figure>`).join('');
  const answer = fill(pick(SUBHEADS));
  const home = `<section class="hero"><div class="wrap"><h1>${esc(fill(pick(OPENERS)))}</h1><p>${esc(answer)}</p><p>${esc(i.tagline ?? i.description)}</p><p><a class="btn" href="${esc(ctaHref)}">${esc(cta)}</a></p></div></section>
<section><div class="wrap"><h2>What we offer</h2><div class="grid">${servicesCards}</div></div></section>
<section><div class="wrap"><h2>Why ${esc(i.city)} ${esc(pack.customer)} choose ${esc(i.businessName)}</h2><div class="grid">${benefits}</div></div></section>
${testimonials ? `<section><div class="wrap"><h2>What customers say</h2><div class="grid">${testimonials}</div></div></section>` : ''}
<section><div class="wrap"><h2>${esc(fill(pick(['Questions we hear often', 'Good to know', 'Answers for {city} {customer}', 'Before you call {name}'])))}</h2>${homeFaqHtml}<p><a href="/faq/">More answers</a></p></div></section>`;

  const contactForm = `<form method="post" action="${i.apiOrigin}/api/sites/${i.siteId}/contact"><input type="hidden" name="redirect" value="${base}/thank-you/">
<label for="n">Name</label><input id="n" name="name" required autocomplete="name"><label for="e">Email</label><input id="e" name="email" type="email" autocomplete="email"><label for="p">Phone</label><input id="p" name="phone" type="tel" autocomplete="tel">
<label for="m">How can we help?</label><textarea id="m" name="message" required rows="5"></textarea><div class="sr"><label for="w">Leave empty</label><input id="w" name="website" tabindex="-1" autocomplete="off"></div><p><button class="btn" type="submit">Send</button></p></form>`;

  const files: Record<string, string> = {
    'index.html': page('/', `${i.businessName} — ${pack.label} in ${i.city}, ${i.state}`, answer, home, [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }]),
    'about/index.html': page('/about/', `About ${i.businessName}`, i.description, `<section class="wrap"><h1>About ${esc(i.businessName)}</h1><p>${esc(i.description)}</p><p>We serve ${esc(areas)}.${i.hours ? ` Hours: ${esc(i.hours)}.` : ''}</p>${i.licenses ? `<p>${esc(i.licenses)}</p>` : ''}</section>`),
    'services/index.html': page('/services/', `Services — ${i.businessName}`, `Services from ${i.businessName} in ${i.city}.`, `<section class="wrap"><h1>Services</h1><div class="grid">${servicesCards}</div></section>`),
    'faq/index.html': page('/faq/', `FAQ — ${i.businessName}`, `Answers to common questions about ${i.businessName}.`, `<section class="wrap"><h1>Frequently asked questions</h1>${faqHtml}</section>`, [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }]),
    'contact/index.html': page('/contact/', `Contact ${i.businessName}`, `Call ${i.phone} or send a message to ${i.businessName}.`, `<section class="wrap"><h1>Contact us</h1><p>Call <a href="tel:${i.phone.replace(/[^+\d]/g, '')}">${esc(i.phone)}</a> or email <a href="mailto:${esc(i.email)}">${esc(i.email)}</a>.</p>${i.address ? `<p>${esc(i.address)}, ${esc(i.city)}, ${esc(i.state)} · <a href="https://www.openstreetmap.org/search?query=${encodeURIComponent(`${i.address}, ${i.city}, ${i.state}`)}">Map</a></p>` : ''}${contactForm}</section>`),
    'privacy/index.html': page('/privacy/', `Privacy — ${i.businessName}`, `Privacy policy for ${i.businessName}.`, `<section class="wrap"><h1>Privacy policy</h1><p>${esc(i.businessName)} collects the information you send through this website (such as your name, email, phone and message) only to respond to you. We do not sell personal information. To ask about or delete your information, email <a href="mailto:${esc(i.email)}">${esc(i.email)}</a>. This site uses no advertising cookies.</p></section>`),
    'terms/index.html': page('/terms/', `Terms — ${i.businessName}`, `Website terms for ${i.businessName}.`, `<section class="wrap"><h1>Website terms</h1><p>Information on this website is provided for general purposes and may change. Prices, availability and services are confirmed when you contact ${esc(i.businessName)}.</p></section>`),
    'thank-you/index.html': page('/thank-you/', `Thank you — ${i.businessName}`, 'Thanks for your message.', `<section class="wrap"><h1>Thank you!</h1><p>We received your message and will reply soon.</p><p><a href="/">Back to home</a></p></section>`),
    '404.html': page('/404.html', `Page not found — ${i.businessName}`, 'Page not found.', `<section class="wrap"><h1>Page not found</h1><p><a href="/">Go to the home page</a></p></section>`),
    'styles.css': css(i),
  };
  for (const s of i.services) {
    files[`services/${slug(s.name)}/index.html`] = page(`/services/${slug(s.name)}/`, `${s.name} in ${i.city} — ${i.businessName}`, `${s.description} ${i.businessName} serves ${areas}.`, `<section class="wrap"><h1>${esc(s.name)} in ${esc(i.city)}</h1><p>${esc(s.description)}</p>${s.priceCents ? `<p>Starting at $${(s.priceCents / 100).toFixed(0)}.</p>` : ''}<p><a class="btn" href="${esc(ctaHref)}">${esc(cta)}</a></p></section>`, [{ '@context': 'https://schema.org', '@type': 'Service', name: s.name, description: s.description, provider: { '@id': `${base}/#business` }, areaServed: areas }]);
  }
  const pages = Object.keys(files).filter((f) => f.endsWith('.html'));
  files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.filter((p) => p !== '404.html' && !p.startsWith('thank-you')).map((p) => `<url><loc>${base}/${p.replace(/index\.html$/, '')}</loc></url>`).join('')}</urlset>`;
  files['robots.txt'] = `User-agent: *\nAllow: /\nDisallow: /thank-you/\nSitemap: ${base}/sitemap.xml\n`;
  files['llms.txt'] = `# ${i.businessName}\n\n> ${answer}\n\nPhone: ${i.phone}\nEmail: ${i.email}\nArea served: ${areas}\n\n## Services\n${i.services.map((s) => `- ${s.name}: ${s.description}`).join('\n')}\n`;
  const homeText = parse(files['index.html']).querySelector('main')?.text.replace(/\s+/g, ' ').trim() ?? '';
  return { files, pages, ms: performance.now() - t0, homeText };
}

/**
 * Publish-time uniqueness (spec Product 5): regenerate with new seeds until the home text is < threshold similar to
 * every existing ROI site (bounded); if it still is not, the site waits for a manager to edit the copy.
 */
export function generateUniqueSite(input: SiteInput, existingHomeTexts: string[], threshold = 0.5, maxTries = 8) {
  let best: { site: GeneratedSite; worst: number } | null = null;
  for (let t = 0; t < maxTries; t++) {
    const site = generateSite(input, `${input.siteId}:${t}`);
    const worst = existingHomeTexts.reduce((m, h) => Math.max(m, shingleSimilarity(site.homeText, h)), 0);
    if (!best || worst < best.worst) best = { site, worst };
    if (worst < threshold) return { ...best, needsManagerReview: false, tries: t + 1 };
  }
  return { ...best!, needsManagerReview: true, tries: maxTries };
}

/** Quality gate before publish (spec Product 5): tokens, required fields, HTML structure, links, a11y basics, claims. */
export function qualityGate(site: GeneratedSite, input: SiteInput) {
  const problems: string[] = [];
  if (!input.businessName || !input.phone || !input.email || !input.city) problems.push('Missing required business fields.');
  for (const [name, html] of Object.entries(site.files)) {
    if (!name.endsWith('.html')) continue;
    if (/\{\{|\{(name|verb|city|state|label|customer|areas|phone)\}/.test(html)) problems.push(`${name}: leftover template token`);
    const root = parse(html, { comment: false });
    if (!root.querySelector('html[lang]')) problems.push(`${name}: missing lang`);
    if (root.querySelectorAll('h1').length !== 1) problems.push(`${name}: must have exactly one h1`);
    if (!root.querySelector('title')?.text.trim()) problems.push(`${name}: missing title`);
    if (!root.querySelector('meta[name="description"]')) problems.push(`${name}: missing meta description`);
    for (const img of root.querySelectorAll('img')) if (!img.getAttribute('alt')) problems.push(`${name}: image without alt`);
    for (const inp of root.querySelectorAll('input:not([type=hidden]), textarea')) {
      const id = inp.getAttribute('id');
      if (!id || !root.querySelector(`label[for="${id}"]`)) problems.push(`${name}: form field without label`);
    }
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href')!;
      if (href.startsWith('/') && !href.startsWith('//')) {
        const target = href === '/' ? 'index.html' : `${href.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
        if (!site.files[target] && !site.files[href.replace(/^\//, '')]) problems.push(`${name}: broken internal link ${href}`);
      }
    }
    for (const v of lintClaims(root.querySelector('main')?.text ?? '')) problems.push(`${name}: claim not allowed (“${v.match}”)`);
  }
  return { ok: problems.length === 0, problems };
}

/** 5-word shingle Jaccard similarity (spec Product 5 / §7.1 GEO gate). */
export function shingleSimilarity(a: string, b: string, k = 5) {
  const sh = (s: string) => {
    const w = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i + k <= w.length; i++) set.add(w.slice(i, i + k).join(' '));
    return set;
  };
  const A = sh(a);
  const B = sh(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
