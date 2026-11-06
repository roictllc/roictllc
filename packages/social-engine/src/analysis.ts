/**
 * Analysis engine (spec Product 9) — no external AI:
 * 1) features per post, 2) engagement rate = (reactions+comments+shares+saves) ÷ reach (fallback ÷ followers),
 * 3) feature lift via ridge regression, 4) Thompson-sampling bandits per decision (hour bucket, weekday, format, CTA)
 *    so the system keeps exploring, 5) plain-language summary. Cold start uses admin-editable industry benchmarks.
 */
export type PostType = 'image' | 'carousel' | 'video' | 'text';
export interface PostObservation {
  type: PostType;
  postedAt: Date;
  caption: string;
  hashtags: string[];
  hasLink: boolean;
  reactions: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number | null;
  followers: number;
}

export function engagementRate(p: Pick<PostObservation, 'reactions' | 'comments' | 'shares' | 'saves' | 'reach' | 'followers'>): number {
  const interactions = p.reactions + p.comments + p.shares + p.saves;
  const denom = p.reach && p.reach > 0 ? p.reach : p.followers > 0 ? p.followers : 0;
  return denom ? interactions / denom : 0;
}

export const HOUR_BUCKETS = ['early', 'morning', 'midday', 'afternoon', 'evening', 'night'] as const;
export type HourBucket = (typeof HOUR_BUCKETS)[number];
export function hourBucket(h: number): HourBucket {
  if (h < 7) return 'early';
  if (h < 10) return 'morning';
  if (h < 13) return 'midday';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}
export const BUCKET_HOUR: Record<HourBucket, number> = { early: 6, morning: 8, midday: 12, afternoon: 15, evening: 19, night: 21 };

export interface Features {
  [name: string]: number;
}

export function extractFeatures(p: PostObservation, tz = 'America/New_York'): Features {
  const local = new Date(p.postedAt.toLocaleString('en-US', { timeZone: tz }));
  const words = p.caption.trim().split(/\s+/).filter(Boolean).length;
  const f: Features = {
    bias: 1,
    [`type_${p.type}`]: 1,
    [`hour_${hourBucket(local.getHours())}`]: 1,
    weekend: local.getDay() === 0 || local.getDay() === 6 ? 1 : 0,
    caption_len: Math.min(words, 300) / 100,
    hashtags: Math.min(p.hashtags.length, 30) / 10,
    question: /\?/.test(p.caption) ? 1 : 0,
    cta: /\b(call|book|visit|shop|order|learn more|link in bio|dm us|sign up|get started)\b/i.test(p.caption) ? 1 : 0,
    link: p.hasLink ? 1 : 0,
  };
  return f;
}

/** Ridge regression (closed form, Gauss–Jordan) over sparse named features. Returns weight per feature. */
export function ridge(rows: Features[], y: number[], lambda = 1): Record<string, number> {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
  const n = names.length;
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  rows.forEach((r, k) => {
    const x = names.map((nm) => r[nm] ?? 0);
    for (let i = 0; i < n; i++) {
      b[i] += x[i] * y[k];
      for (let j = 0; j < n; j++) A[i][j] += x[i] * x[j];
    }
  });
  for (let i = 0; i < n; i++) if (names[i] !== 'bias') A[i][i] += lambda;
  // Solve A w = b
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-12;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f) for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return Object.fromEntries(names.map((nm, i) => [nm, M[i][n]]));
}

// ── Thompson sampling with Beta posteriors over "did this post beat the account's median ER?" ──
export interface Arm {
  alpha: number;
  beta: number;
}
export type Bandit = Record<string, Arm>;

function gammaSample(k: number, rand: () => number): number {
  // Marsaglia–Tsang for k ≥ 1; boost for k < 1
  if (k < 1) return gammaSample(k + 1, rand) * Math.pow(rand(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      const u1 = rand() || 1e-12;
      const u2 = rand();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function betaSample(a: number, b: number, rand: () => number = Math.random) {
  const x = gammaSample(a, rand);
  const y = gammaSample(b, rand);
  return x / (x + y);
}

export function updateBandit(bandit: Bandit, arm: string, success: boolean): Bandit {
  const cur = bandit[arm] ?? { alpha: 1, beta: 1 };
  return { ...bandit, [arm]: { alpha: cur.alpha + (success ? 1 : 0), beta: cur.beta + (success ? 0 : 1) } };
}

export function chooseArm(bandit: Bandit, arms: string[], rand: () => number = Math.random): string {
  let best = arms[0];
  let bestV = -1;
  for (const a of arms) {
    const p = bandit[a] ?? { alpha: 1, beta: 1 };
    const v = betaSample(p.alpha, p.beta, rand);
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  return best;
}

export interface InsightModel {
  weights: Record<string, number>;
  bandits: { hour: Bandit; type: Bandit; cta: Bandit };
  medianEr: number;
  sampleSize: number;
  insights: string[];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Cold-start priors from industry benchmarks: pseudo-counts that bias but don't fix the bandit. */
export function priorsFromBenchmark(bench: { bestHours?: HourBucket[]; bestTypes?: PostType[] } = {}): InsightModel['bandits'] {
  const hour: Bandit = Object.fromEntries(HOUR_BUCKETS.map((h) => [h, bench.bestHours?.includes(h) ? { alpha: 3, beta: 1 } : { alpha: 1, beta: 1 }]));
  const type: Bandit = Object.fromEntries((['image', 'carousel', 'video', 'text'] as PostType[]).map((t) => [t, bench.bestTypes?.includes(t) ? { alpha: 3, beta: 1 } : { alpha: 1, beta: 1 }]));
  return { hour, type, cta: { yes: { alpha: 1, beta: 1 }, no: { alpha: 1, beta: 1 } } };
}

export function trainModel(posts: PostObservation[], tz = 'America/New_York', bench?: Parameters<typeof priorsFromBenchmark>[0]): InsightModel {
  const ers = posts.map(engagementRate);
  const med = median(ers);
  const feats = posts.map((p) => extractFeatures(p, tz));
  const weights = posts.length >= 5 ? ridge(feats, ers, 0.5) : {};
  let bandits = priorsFromBenchmark(bench);
  posts.forEach((p, i) => {
    const win = ers[i] > med;
    const local = new Date(p.postedAt.toLocaleString('en-US', { timeZone: tz }));
    bandits = {
      hour: updateBandit(bandits.hour, hourBucket(local.getHours()), win),
      type: updateBandit(bandits.type, p.type, win),
      cta: updateBandit(bandits.cta, feats[i].cta ? 'yes' : 'no', win),
    };
  });
  const insights: string[] = [];
  if (posts.length < 5) insights.push(`ROI has ${posts.length} post(s) to learn from; it is starting from your industry’s benchmarks and will personalize as results come in.`);
  else {
    const mean = (arm: Arm) => arm.alpha / (arm.alpha + arm.beta);
    const bestHour = Object.entries(bandits.hour).sort((a, b) => mean(b[1]) - mean(a[1]))[0][0];
    const bestType = Object.entries(bandits.type).sort((a, b) => mean(b[1]) - mean(a[1]))[0][0];
    insights.push(`Your ${bestType} posts beat your typical engagement most often.`);
    insights.push(`Posts in the ${bestHour} (${BUCKET_HOUR[bestHour as HourBucket]}:00 local) slot perform best so far.`);
    if ((weights.question ?? 0) > 0.002) insights.push('Captions that ask a question lift engagement for your audience.');
    if ((weights.link ?? 0) < -0.002) insights.push('Posts with links tend to get less engagement — ROI keeps links for posts where traffic matters.');
    if ((weights.hashtags ?? 0) < -0.002) insights.push('Fewer hashtags work better for you; ROI will use a tighter set.');
  }
  insights.push(`Median engagement rate across ${posts.length} post(s): ${(med * 100).toFixed(2)}%.`);
  return { weights, bandits, medianEr: med, sampleSize: posts.length, insights };
}
