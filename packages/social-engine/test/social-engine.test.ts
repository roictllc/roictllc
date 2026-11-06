import { describe, expect, it } from 'vitest';
import { authorizeUrl, betaSample, chooseArm, engagementRate, generateCaption, pkcePair, planCalendar, ridge, trainModel, type PostObservation } from '../src';

const post = (o: Partial<PostObservation>): PostObservation => ({ type: 'image', postedAt: new Date('2026-10-01T23:00:00Z'), caption: 'Hello there', hashtags: [], hasLink: false, reactions: 10, comments: 1, shares: 0, saves: 0, reach: 500, followers: 1000, ...o });

describe('engagement rate', () => {
  it('uses reach, falls back to followers', () => {
    expect(engagementRate(post({}))).toBeCloseTo(11 / 500);
    expect(engagementRate(post({ reach: null }))).toBeCloseTo(11 / 1000);
    expect(engagementRate(post({ reach: 0, followers: 0 }))).toBe(0);
  });
});

describe('ridge regression', () => {
  it('recovers a known linear relation', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ bias: 1, a: i % 2, b: (i % 3) / 2 }));
    const y = rows.map((r) => 0.01 + 0.05 * r.a - 0.02 * r.b);
    const w = ridge(rows, y, 1e-6);
    expect(w.a).toBeCloseTo(0.05, 3);
    expect(w.b).toBeCloseTo(-0.02, 3);
  });
});

describe('Thompson sampling', () => {
  it('beta samples are in (0,1) with the right mean', () => {
    const xs = Array.from({ length: 4000 }, () => betaSample(8, 2));
    expect(xs.every((x) => x > 0 && x < 1)).toBe(true);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeCloseTo(0.8, 1);
  });
  it('exploits a clearly better arm but still explores', () => {
    const counts = { good: 0, bad: 0 };
    for (let i = 0; i < 2000; i++) counts[chooseArm({ good: { alpha: 40, beta: 10 }, bad: { alpha: 10, beta: 40 } }, ['good', 'bad']) as 'good' | 'bad']++;
    expect(counts.good).toBeGreaterThan(1900);
    const even = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) even[chooseArm({}, ['a', 'b']) as 'a' | 'b']++;
    expect(even.a).toBeGreaterThan(800);
  });
});

describe('model training learns what works', () => {
  it('finds video + evening best when the data says so', () => {
    const posts: PostObservation[] = [];
    for (let i = 0; i < 40; i++) {
      const good = i % 2 === 0;
      posts.push(post({ type: good ? 'video' : 'text', postedAt: new Date(Date.UTC(2026, 9, 1 + i, good ? 23 : 14)), reactions: good ? 60 : 5 }));
    }
    const m = trainModel(posts);
    expect(m.sampleSize).toBe(40);
    expect(m.insights.join(' ')).toMatch(/video/);
    expect(m.insights.join(' ')).toMatch(/evening/);
  });
  it('cold start explains it uses benchmarks', () => {
    expect(trainModel([post({})]).insights[0]).toMatch(/benchmarks/);
  });
});

describe('captions and calendar', () => {
  const kit = { businessName: 'Bayview Family Dental', industry: 'dentist', city: 'Tampa', tone: 'friendly' as const, doNotSay: ['cheap'], offers: ['New patients get a free whitening consult'] };
  it('respects platform limits, filters claims and do-not-say terms, is deterministic', () => {
    const a = generateCaption(kit, 'X', 'seed-1', { withCta: true });
    const b = generateCaption(kit, 'X', 'seed-1', { withCta: true });
    expect(a).toEqual(b);
    expect(a.caption.length + a.hashtags.map((t) => t.length + 2).reduce((s, n) => s + n, 0)).toBeLessThanOrEqual(282);
    expect(a.hashtags.length).toBeLessThanOrEqual(2);
    expect(a.caption.toLowerCase()).not.toContain('cheap');
    expect(a.caption).not.toMatch(/guarantee/i);
  });
  it('plans 30 posts across 30 days with TikTok forced to video', () => {
    const m = trainModel([]);
    const plan = planCalendar(kit, 'TIKTOK', m, { start: new Date('2026-11-07T00:00:00Z'), postsPerMonth: 30, seed: 'ws1' });
    expect(plan).toHaveLength(30);
    expect(plan.every((p) => p.type === 'video')).toBe(true);
    const span = (plan[29].date.getTime() - plan[0].date.getTime()) / 86400_000;
    expect(span).toBeGreaterThan(27);
  });
});

describe('OAuth', () => {
  it('builds official authorize URLs with PKCE where required', () => {
    const env = { X_CLIENT_ID: 'x-id', META_APP_ID: 'm-id', TIKTOK_CLIENT_KEY: 't-key' } as NodeJS.ProcessEnv;
    const { challenge } = pkcePair();
    const x = new URL(authorizeUrl('X', 'https://roictllc.com/api/social/callback/x', 'st', challenge, env));
    expect(x.host).toBe('x.com');
    expect(x.searchParams.get('code_challenge_method')).toBe('S256');
    expect(x.searchParams.get('scope')).toContain('tweet.write');
    const ig = new URL(authorizeUrl('INSTAGRAM', 'https://roictllc.com/cb', 'st', undefined, env));
    expect(ig.host).toBe('www.facebook.com');
    expect(ig.searchParams.get('scope')).toContain('instagram_content_publish');
    expect(new URL(authorizeUrl('TIKTOK', 'https://roictllc.com/cb', 'st', challenge, env)).searchParams.get('client_key')).toBe('t-key');
    expect(() => authorizeUrl('X', 'https://a', 's', undefined, {} as NodeJS.ProcessEnv)).toThrow(/X_CLIENT_ID/);
  });
});
