import { parse, type HTMLElement } from 'node-html-parser';
import { robotsAllows, safeFetch, type SafeResponse } from './safe-fetch';

/**
 * AI Visibility Audit (spec Product 11 step 1). Runs entirely inside ROI: fetches the homepage, robots.txt,
 * llms.txt and sitemap with the SSRF-safe client, then scores 0–100 across seven weighted categories and
 * produces a prioritized fix list. Every check is deterministic and explained; nothing is invented.
 */
export const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot'];

export interface AuditInput {
  businessName: string;
  url: string;
  city: string;
  category: string;
}
export interface Check {
  id: string;
  category: Category;
  label: string;
  passed: boolean;
  points: number;
  max: number;
  detail: string;
  fix?: string;
  impact: 1 | 2 | 3; // 3 = high
  effort: 1 | 2 | 3; // 1 = low
}
export type Category = 'crawlability' | 'entity' | 'schema' | 'answers' | 'technical' | 'listings' | 'reviews';
export const CATEGORY_LABELS: Record<Category, string> = {
  crawlability: 'AI crawler access', entity: 'Entity clarity', schema: 'Structured data', answers: 'Answer-ready content',
  technical: 'Technical foundations', listings: 'Listings & profiles (sameAs)', reviews: 'Reviews & reputation signals',
};
export interface AuditResult {
  score: number;
  breakdown: Record<Category, { points: number; max: number }>;
  checks: Check[];
  fixes: Check[];
  fetched: { url: string; status: number; timeMs: number; robots: boolean; llms: boolean; sitemap: boolean };
}

type Fetcher = (url: string, opts?: { maxBytes?: number; accept?: string }) => Promise<SafeResponse>;

function jsonLdBlocks(root: HTMLElement): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.text);
      const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const it of items) if (it && typeof it === 'object') out.push(it as Record<string, unknown>);
    } catch {
      /* invalid JSON-LD is reported by the check below */
    }
  }
  return out;
}
const typesOf = (items: Array<Record<string, unknown>>) => items.flatMap((i) => (Array.isArray(i['@type']) ? (i['@type'] as string[]) : [String(i['@type'] ?? '')]));
const LOCAL_TYPES = /LocalBusiness|Dentist|Plumber|Electrician|HVACBusiness|RoofingContractor|GeneralContractor|HomeAndConstructionBusiness|LegalService|Attorney|AccountingService|Restaurant|FoodEstablishment|BeautySalon|HairSalon|HealthAndBeautyBusiness|MedicalBusiness|Physician|AutoRepair|ProfessionalService|Store|RealEstateAgent|ExerciseGym|VeterinaryCare|MovingCompany|PestControl|CleaningService|Locksmith|Notary|InsuranceAgency|FinancialService/;
const PHONE_RE = /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const ADDRESS_RE = /\b\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway|Suite|Ste)\b/i;
const PROFILE_HOSTS = /(google\.com\/maps|g\.page|maps\.app\.goo\.gl|yelp\.com|facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|x\.com|twitter\.com|youtube\.com|bbb\.org|nextdoor\.com|angi\.com|houzz\.com|thumbtack\.com|healthgrades\.com|zocdoc\.com|avvo\.com|tripadvisor\.com|apple\.com\/maps|bing\.com\/maps)/i;

export async function runAiVisibilityAudit(input: AuditInput, fetcher: Fetcher = safeFetch): Promise<AuditResult> {
  const home = await fetcher(input.url, { maxBytes: 3_000_000 });
  const origin = new URL(home.url).origin;
  const [robots, llms, sitemap] = await Promise.all([
    fetcher(`${origin}/robots.txt`, { maxBytes: 200_000, accept: 'text/plain' }).catch(() => null),
    fetcher(`${origin}/llms.txt`, { maxBytes: 200_000, accept: 'text/plain' }).catch(() => null),
    fetcher(`${origin}/sitemap.xml`, { maxBytes: 2_000_000, accept: 'application/xml,text/xml' }).catch(() => null),
  ]);
  const robotsTxt = robots && robots.status === 200 && !/<html/i.test(robots.body) ? robots.body : '';
  const hasLlms = !!(llms && llms.status === 200 && llms.body.trim().length > 40 && !/<html/i.test(llms.body));
  const hasSitemap = !!(sitemap && sitemap.status === 200 && /<(urlset|sitemapindex)/i.test(sitemap.body));

  const root = parse(home.body, { comment: false });
  const text = root.querySelector('body')?.text.replace(/\s+/g, ' ').trim() ?? '';
  const title = root.querySelector('title')?.text.trim() ?? '';
  const metaDesc = root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '';
  const h1s = root.querySelectorAll('h1').map((h) => h.text.trim());
  const headings = root.querySelectorAll('h2, h3').map((h) => h.text.trim());
  const ld = jsonLdBlocks(root);
  const types = typesOf(ld);
  const rawLdCount = root.querySelectorAll('script[type="application/ld+json"]').length;
  const links = root.querySelectorAll('a[href]').map((a) => a.getAttribute('href') ?? '');
  const sameAs = ld.flatMap((i) => (Array.isArray(i.sameAs) ? (i.sameAs as string[]) : i.sameAs ? [String(i.sameAs)] : []));
  const profileLinks = [...new Set([...sameAs, ...links].filter((h) => PROFILE_HOSTS.test(h)))];
  const nameLc = input.businessName.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const checks: Check[] = [];
  const add = (c: Omit<Check, 'points'> & { points?: number }) => checks.push({ ...c, points: c.passed ? c.max : c.points ?? 0 });

  // 1. Crawlability (20)
  const blocked = AI_CRAWLERS.filter((a) => robotsTxt && !robotsAllows(robotsTxt, a, '/'));
  add({ id: 'ai-crawlers-allowed', category: 'crawlability', label: 'AI crawlers may read your site', max: 12, passed: blocked.length === 0,
    points: Math.round(12 * (1 - blocked.length / AI_CRAWLERS.length)),
    detail: blocked.length ? `robots.txt blocks: ${blocked.join(', ')}` : robotsTxt ? 'robots.txt allows the major AI crawlers.' : 'No robots.txt found; crawlers are allowed by default.',
    fix: blocked.length ? `Allow ${blocked.join(', ')} in robots.txt for public pages (keep private areas disallowed).` : undefined, impact: 3, effort: 1 });
  add({ id: 'llms-txt', category: 'crawlability', label: 'llms.txt guide for AI systems', max: 4, passed: hasLlms,
    detail: hasLlms ? 'llms.txt found.' : 'No llms.txt at the site root.', fix: 'Publish /llms.txt summarizing who you are, services, areas served and key pages.', impact: 2, effort: 1 });
  add({ id: 'sitemap', category: 'crawlability', label: 'XML sitemap', max: 4, passed: hasSitemap,
    detail: hasSitemap ? 'sitemap.xml found.' : 'No sitemap.xml found.', fix: 'Publish /sitemap.xml and reference it in robots.txt.', impact: 2, effort: 1 });

  // 2. Entity clarity (15)
  const nameInTitle = title.toLowerCase().includes(nameLc);
  const nameInH1orLd = h1s.some((h) => h.toLowerCase().includes(nameLc)) || ld.some((i) => String(i.name ?? '').toLowerCase().includes(nameLc));
  add({ id: 'name-consistent', category: 'entity', label: 'Business name is unambiguous', max: 5, passed: nameInTitle && nameInH1orLd, points: (nameInTitle ? 2 : 0) + (nameInH1orLd ? 3 : 0),
    detail: `Name in <title>: ${nameInTitle ? 'yes' : 'no'}; in H1 or schema: ${nameInH1orLd ? 'yes' : 'no'}.`, fix: `Use “${input.businessName}” consistently in the page title, the main heading and Organization/LocalBusiness schema.`, impact: 3, effort: 1 });
  const phone = PHONE_RE.test(text) || links.some((h) => h.startsWith('tel:'));
  add({ id: 'phone', category: 'entity', label: 'Phone number visible', max: 3, passed: phone, detail: phone ? 'A phone number is on the page.' : 'No phone number found on the homepage.', fix: 'Show your phone number as a clickable tel: link in the header or footer.', impact: 2, effort: 1 });
  const address = ADDRESS_RE.test(text) || ld.some((i) => !!i.address);
  add({ id: 'address', category: 'entity', label: 'Address or service area stated', max: 4, passed: address, detail: address ? 'Address/service area found.' : 'No street address or PostalAddress found.', fix: 'State your address (or service area for home-service businesses) in text and in schema.', impact: 3, effort: 1 });
  const cityMentioned = text.toLowerCase().includes(input.city.toLowerCase());
  add({ id: 'city', category: 'entity', label: `Mentions ${input.city}`, max: 3, passed: cityMentioned, detail: cityMentioned ? 'Your city appears on the page.' : `“${input.city}” does not appear on the homepage.`, fix: `Say clearly that you serve ${input.city} (and nearby areas you really serve).`, impact: 2, effort: 1 });

  // 3. Schema (20)
  add({ id: 'jsonld-valid', category: 'schema', label: 'Structured data (JSON-LD) present and valid', max: 4, passed: ld.length > 0 && ld.length >= rawLdCount, points: ld.length ? 2 : 0,
    detail: rawLdCount === 0 ? 'No JSON-LD found.' : ld.length < rawLdCount ? `${rawLdCount - ld.length} JSON-LD block(s) are invalid JSON.` : `${ld.length} JSON-LD item(s) found.`, fix: 'Add valid JSON-LD describing your business.', impact: 3, effort: 2 });
  const local = types.some((t) => LOCAL_TYPES.test(t));
  const org = types.some((t) => /Organization|Corporation/.test(t)) || local;
  add({ id: 'org-schema', category: 'schema', label: 'Organization / LocalBusiness schema', max: 7, passed: local, points: org ? 4 : 0,
    detail: local ? `Found ${types.filter((t) => LOCAL_TYPES.test(t)).join(', ')}.` : org ? 'Organization found, but no specific LocalBusiness subtype.' : 'No Organization or LocalBusiness schema.', fix: `Add ${input.category ? 'a specific LocalBusiness subtype (e.g. Dentist, Plumber)' : 'LocalBusiness'} with name, address, phone, hours, areaServed and sameAs.`, impact: 3, effort: 2 });
  const service = types.some((t) => /Service|Offer|Product/.test(t)) || ld.some((i) => !!i.hasOfferCatalog || !!i.makesOffer);
  add({ id: 'service-schema', category: 'schema', label: 'Services described in schema', max: 4, passed: service, detail: service ? 'Service/Offer data found.' : 'Services are not described in structured data.', fix: 'Describe each service with Service schema (name, description, areaServed, price range if public).', impact: 2, effort: 2 });
  const faqSchema = types.includes('FAQPage');
  add({ id: 'faq-schema', category: 'schema', label: 'FAQPage schema matching visible FAQs', max: 5, passed: faqSchema, detail: faqSchema ? 'FAQPage found.' : 'No FAQPage schema.', fix: 'Add a visible FAQ section and matching FAQPage schema.', impact: 2, effort: 1 });

  // 4. Answer-ready content (20)
  const questions = headings.filter((h) => /\?\s*$/.test(h) || /^(how|what|why|when|where|who|which|can|do|does|is|are|should)\b/i.test(h));
  add({ id: 'question-headings', category: 'answers', label: 'Question-style headings', max: 6, passed: questions.length >= 3, points: Math.min(6, questions.length * 2),
    detail: `${questions.length} question-style heading(s).`, fix: 'Add H2/H3 headings phrased as the questions customers ask, each followed by a direct answer.', impact: 3, effort: 2 });
  const firstPara = root.querySelectorAll('main p, article p, body p').map((p) => p.text.replace(/\s+/g, ' ').trim()).find((p) => p.split(' ').length >= 25) ?? '';
  const firstLen = firstPara.split(' ').length;
  const directAnswer = firstLen >= 30 && firstLen <= 80 && (firstPara.toLowerCase().includes(nameLc) || firstPara.toLowerCase().includes(input.category.toLowerCase().split(' ')[0]));
  add({ id: 'direct-answer', category: 'answers', label: 'Direct 40–60-word answer near the top', max: 6, passed: directAnswer, points: firstLen >= 25 ? 2 : 0,
    detail: firstPara ? `First substantial paragraph: ${firstLen} words.` : 'No substantial paragraph found.', fix: `Open with 40–60 words that say who you are, what you do, for whom and where: “${input.businessName} is a ${input.category} in ${input.city} that…”.`, impact: 3, effort: 1 });
  add({ id: 'content-depth', category: 'answers', label: 'Enough content to understand your services', max: 5, passed: words >= 500, points: Math.min(5, Math.floor(words / 100)),
    detail: `About ${words} words on the homepage.`, fix: 'Explain services, process, prices or price ranges, service areas and credentials in plain language.', impact: 2, effort: 2 });
  const hasTable = root.querySelectorAll('table, dl').length > 0 || /\bvs\.?\b|compare|comparison/i.test(text);
  add({ id: 'comparisons', category: 'answers', label: 'Comparisons, prices or definition blocks', max: 3, passed: hasTable, detail: hasTable ? 'Found comparison/definition content.' : 'No comparison tables or definition lists.', fix: 'Add a short comparison or “what’s included” table — AI answers often quote them.', impact: 1, effort: 2 });

  // 5. Technical (13)
  const https = home.url.startsWith('https://');
  add({ id: 'https', category: 'technical', label: 'HTTPS', max: 3, passed: https, detail: https ? 'Served over HTTPS.' : 'Not served over HTTPS.', fix: 'Serve the site over HTTPS with a valid certificate.', impact: 3, effort: 1 });
  const titleOk = title.length >= 15 && title.length <= 65;
  add({ id: 'title', category: 'technical', label: 'Descriptive title (15–65 chars)', max: 2, passed: titleOk, detail: `Title: “${title.slice(0, 90)}” (${title.length} chars).`, fix: `Use a title like “${input.businessName} — ${input.category} in ${input.city}”.`, impact: 2, effort: 1 });
  const descOk = metaDesc.length >= 70 && metaDesc.length <= 170;
  add({ id: 'meta-description', category: 'technical', label: 'Meta description (70–170 chars)', max: 2, passed: descOk, detail: metaDesc ? `${metaDesc.length} chars.` : 'Missing.', fix: 'Write a specific meta description with service, city and a reason to choose you.', impact: 1, effort: 1 });
  const canonical = !!root.querySelector('link[rel="canonical"]');
  add({ id: 'canonical', category: 'technical', label: 'Canonical URL', max: 2, passed: canonical, detail: canonical ? 'Present.' : 'Missing.', fix: 'Add <link rel="canonical"> to every page.', impact: 1, effort: 1 });
  const lang = !!root.querySelector('html')?.getAttribute('lang');
  const viewport = !!root.querySelector('meta[name="viewport"]');
  add({ id: 'lang-viewport', category: 'technical', label: 'Language and mobile viewport', max: 2, passed: lang && viewport, points: (lang ? 1 : 0) + (viewport ? 1 : 0), detail: `lang: ${lang ? 'yes' : 'no'}, viewport: ${viewport ? 'yes' : 'no'}.`, fix: 'Set <html lang="en-US"> and a responsive viewport meta tag.', impact: 1, effort: 1 });
  const fast = home.timeMs < 2500;
  add({ id: 'response-time', category: 'technical', label: 'Fast server response', max: 2, passed: fast, detail: `Homepage fetched in ${home.timeMs} ms (from ROI’s server).`, fix: 'Use caching/CDN; aim for well under 1 s server response.', impact: 1, effort: 2 });

  // 6. Listings / sameAs (7)
  add({ id: 'profiles', category: 'listings', label: 'Links to your profiles (Google, Yelp, social)', max: 4, passed: profileLinks.length >= 3, points: Math.min(4, profileLinks.length),
    detail: `${profileLinks.length} profile link(s) found.`, fix: 'Link your Google Business Profile, Yelp/industry directories and social profiles, and list them in schema sameAs.', impact: 2, effort: 1 });
  add({ id: 'sameas', category: 'listings', label: 'sameAs in schema', max: 3, passed: sameAs.length >= 2, points: sameAs.length ? 1 : 0, detail: `${sameAs.length} sameAs URL(s).`, fix: 'Add sameAs with your official profile URLs so AI can connect the dots.', impact: 2, effort: 1 });

  // 7. Reviews signals (5) — on-site evidence only; real review counts come from listings in the paid plan.
  const reviewSchema = types.some((t) => /AggregateRating|Review/.test(t)) || ld.some((i) => !!i.aggregateRating);
  const testimonials = /testimonial|review|stars?|rated/i.test(text);
  add({ id: 'reviews', category: 'reviews', label: 'Real reviews or testimonials referenced', max: 5, passed: reviewSchema || testimonials, points: testimonials ? 3 : 0,
    detail: reviewSchema ? 'Review data in schema.' : testimonials ? 'Testimonials mentioned on the page.' : 'No reviews or testimonials found.', fix: 'Show genuine customer reviews and link to where they are published. Never invent reviews.', impact: 2, effort: 2 });

  const breakdown = {} as AuditResult['breakdown'];
  for (const c of checks) {
    breakdown[c.category] ??= { points: 0, max: 0 };
    breakdown[c.category].points += c.points;
    breakdown[c.category].max += c.max;
  }
  const total = checks.reduce((s, c) => s + c.max, 0);
  const got = checks.reduce((s, c) => s + c.points, 0);
  const fixes = checks.filter((c) => !c.passed && c.fix).sort((a, b) => b.impact * 3 - b.effort - (a.impact * 3 - a.effort) || b.max - b.points - (a.max - a.points));
  return {
    score: Math.round((got / total) * 100), breakdown, checks, fixes,
    fetched: { url: home.url, status: home.status, timeMs: home.timeMs, robots: !!robotsTxt, llms: hasLlms, sitemap: hasSitemap },
  };
}
