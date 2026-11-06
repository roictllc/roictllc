import { chooseArm, BUCKET_HOUR, HOUR_BUCKETS, type HourBucket, type InsightModel, type PostType } from './analysis';

/**
 * Caption + hashtag generation and 30-day planning (spec Product 9) — template grammar, industry/local vocabulary,
 * tone presets, banned-phrase and claim filters, per-platform limits. Deterministic for a given seed.
 */
export interface BrandKit {
  businessName: string;
  industry: string;
  city?: string;
  tone: 'friendly' | 'professional' | 'bold' | 'playful';
  offers?: string[];
  doNotSay?: string[];
}

const LIMITS = { INSTAGRAM: { chars: 2200, tags: 30 }, FACEBOOK: { chars: 5000, tags: 5 }, TIKTOK: { chars: 2200, tags: 8 }, X: { chars: 280, tags: 2 } } as const;
export type PlatformKey = keyof typeof LIMITS;

const INDUSTRY: Record<string, { topics: string[]; tags: string[] }> = {
  dentist: { topics: ['a quick tip for whiter teeth without harsh products', 'what happens at a routine cleaning', 'how often to replace your toothbrush', 'why flossing still matters'], tags: ['dentist', 'dentalcare', 'smile', 'oralhealth', 'familydentist', 'teeth'] },
  construction: { topics: ['a before-and-after from a recent project', 'how to plan a remodel budget', 'what “licensed and insured” really protects', 'questions to ask before hiring a contractor'], tags: ['construction', 'remodel', 'contractor', 'homeimprovement', 'renovation', 'builder'] },
  restaurant: { topics: ['the story behind a favorite dish', 'this week’s special', 'a peek into the kitchen', 'how we source our ingredients'], tags: ['foodie', 'localeats', 'restaurant', 'eatlocal', 'chef'] },
  salon: { topics: ['a 30-second styling tip', 'how to make color last longer', 'a recent transformation', 'what to ask for at your next cut'], tags: ['salon', 'hairstylist', 'haircare', 'hairgoals', 'beauty'] },
  default: { topics: ['a quick tip from our team', 'a question we hear every week', 'a behind-the-scenes look', 'how we help customers like you'], tags: ['smallbusiness', 'shoplocal', 'supportlocal', 'localbusiness'] },
};

const OPENERS = {
  friendly: ['Quick tip:', 'Here’s one we love:', 'Did you know?', 'Happy {day}!'],
  professional: ['Insight:', 'From our team:', 'Worth knowing:', 'A common question:'],
  bold: ['Let’s talk about it:', 'Real talk:', 'Here’s the truth:', 'Stop scrolling:'],
  playful: ['Fun fact!', 'Okay, hear us out:', 'Little secret:', 'Plot twist:'],
};
const CTAS = ['Questions? Send us a message.', 'Book a visit — link in bio.', 'Call us today.', 'Tell us what you think in the comments.', 'Save this for later.'];

const CLAIMS = /\b(guarantee[sd]?|cure[sd]?|100% (safe|effective|unique)|risk[- ]free|best in the world|#1 in)\b/i;

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const pick = <T,>(xs: readonly T[], r: () => number) => xs[Math.floor(r() * xs.length)];

export interface CaptionResult {
  caption: string;
  hashtags: string[];
  topic: string;
  blocked: string[];
}

export function generateCaption(kit: BrandKit, platform: PlatformKey, seed: string, opts: { withQuestion?: boolean; withCta?: boolean; date?: Date } = {}): CaptionResult {
  const r = rng(`${seed}:${platform}`);
  const pack = INDUSTRY[kit.industry] ?? INDUSTRY.default;
  const topic = pick(pack.topics, r);
  const day = (opts.date ?? new Date()).toLocaleDateString('en-US', { weekday: 'long' });
  const opener = pick(OPENERS[kit.tone], r).replace('{day}', day);
  const where = kit.city ? ` here in ${kit.city}` : '';
  const offer = kit.offers?.length && r() < 0.35 ? ` ${pick(kit.offers, r)}.` : '';
  const question = opts.withQuestion ? ` What would you like us to cover next?` : '';
  const cta = opts.withCta ? ` ${pick(CTAS, r)}` : '';
  let caption = `${opener} ${topic.charAt(0).toUpperCase()}${topic.slice(1)} — from ${kit.businessName}${where}.${offer}${question}${cta}`.replace(/\s+/g, ' ').trim();
  const blocked: string[] = [];
  for (const term of kit.doNotSay ?? []) {
    if (term && caption.toLowerCase().includes(term.toLowerCase())) {
      blocked.push(term);
      caption = caption.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').replace(/\s+/g, ' ').trim();
    }
  }
  if (CLAIMS.test(caption)) {
    blocked.push('claim');
    caption = caption.replace(CLAIMS, '').replace(/\s+/g, ' ').trim();
  }
  const lim = LIMITS[platform];
  const local = kit.city ? [kit.city.toLowerCase().replace(/[^a-z0-9]/g, '')] : [];
  const tags = [...new Set([...pack.tags, ...local])].slice(0, lim.tags);
  const tagText = tags.map((t) => `#${t}`).join(' ');
  if (caption.length + 2 + tagText.length > lim.chars) caption = caption.slice(0, Math.max(0, lim.chars - tagText.length - 3)).replace(/\s+\S*$/, '') + '…';
  return { caption, hashtags: tags, topic, blocked };
}

export interface PlannedPost {
  date: Date;
  hourBucket: HourBucket;
  type: PostType;
  cta: boolean;
  caption: CaptionResult;
}

/** 30-day calendar: posts spread evenly, each slot's hour/format/CTA chosen by Thompson sampling. */
export function planCalendar(kit: BrandKit, platform: PlatformKey, model: Pick<InsightModel, 'bandits'>, opts: { start: Date; postsPerMonth: number; seed: string; tz?: string }): PlannedPost[] {
  const r = rng(opts.seed);
  const n = Math.max(1, Math.min(90, opts.postsPerMonth));
  const gap = 30 / n;
  const out: PlannedPost[] = [];
  for (let i = 0; i < n; i++) {
    const hb = chooseArm(model.bandits.hour, [...HOUR_BUCKETS], r) as HourBucket;
    const type = chooseArm(model.bandits.type, platform === 'TIKTOK' ? ['video'] : platform === 'X' ? ['text', 'image'] : ['image', 'carousel', 'video'], r) as PostType;
    const cta = chooseArm(model.bandits.cta, ['yes', 'no'], r) === 'yes';
    const d = new Date(opts.start.getTime() + Math.round(i * gap) * 86400_000);
    d.setUTCHours(BUCKET_HOUR[hb] + 5, Math.floor(r() * 50), 0, 0); // ~local Eastern → UTC; scheduler re-localizes per workspace tz
    out.push({ date: d, hourBucket: hb, type, cta, caption: generateCaption(kit, platform, `${opts.seed}:${i}`, { withCta: cta, withQuestion: r() < 0.4, date: d }) });
  }
  return out;
}
