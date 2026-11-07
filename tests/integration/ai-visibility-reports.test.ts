import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { db } from '@roi/database';
import { aiReportHandler, enqueue, localStorage, mentionStats } from '@roi/product-engine';
import { makeCustomer } from './helpers';

/** Product 11 (spec §12 tests): mention statistics with data age, monthly report from stored results only. */
const storage = localStorage(mkdtempSync(path.join(tmpdir(), 'roi-aiv-')));
const FUTURE = new Date(Date.now() + 365 * 86_400_000);

describe('AI Visibility tracking + report', () => {
  it('computes per-engine mention rate, average position and an 8-week trend', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const s = mentionStats([
      { engine: 'chatgpt', mentioned: true, position: 2, checkedAt: day(1), method: 'manual' },
      { engine: 'chatgpt', mentioned: false, position: null, checkedAt: day(3), method: 'manual' },
      { engine: 'perplexity', mentioned: true, position: 1, checkedAt: day(2), method: 'api' },
      { engine: 'gemini', mentioned: false, position: null, checkedAt: day(45), method: 'manual' }, // outside 30 days
    ], now);
    expect(s.overall).toBe(67);
    expect(s.perEngine.find((e) => e.engine === 'chatgpt')).toMatchObject({ rate: 50, avgPosition: 2, checks: 2 });
    expect(s.perEngine.find((e) => e.engine === 'gemini')).toMatchObject({ rate: null, checks: 0 });
    expect(s.weekly).toHaveLength(8);
    expect(s.weekly[7]).toBe(67);
  });

  it('builds the monthly PDF from stored checks, stores it for the customer and never claims guarantees', async () => {
    const { ws, user } = await makeCustomer('aivr');
    const q = await db().aiTrackedQuestion.create({ data: { workspaceId: ws.id, question: 'best family dentist in Tampa' } });
    const month = '2026-10';
    const at = (d: number) => new Date(Date.UTC(2026, 9, d, 12));
    await db().aiMentionCheck.createMany({ data: [
      { questionId: q.id, engine: 'chatgpt', method: 'manual', mentioned: true, position: 2, checkedAt: at(5), idempotencyKey: `t1-${q.id}` },
      { questionId: q.id, engine: 'perplexity', method: 'manual', mentioned: false, checkedAt: at(12), idempotencyKey: `t2-${q.id}` },
      { questionId: q.id, engine: 'chatgpt', method: 'manual', mentioned: false, checkedAt: new Date(Date.UTC(2026, 8, 20, 12)), idempotencyKey: `t3-${q.id}` },
    ] });
    await db().aiVisibilityAudit.create({ data: { workspaceId: ws.id, businessName: 'Aivr Co', city: 'Tampa', category: 'dentist', url: 'https://example.com', status: 'COMPLETED', score: 62, fixes: [{ title: 'Add LocalBusiness schema with opening hours', impact: 'high' }, { title: 'We guarantee top ranking', impact: 'high' }], shareToken: `tok-${Date.now()}` } });
    const job = await enqueue(db(), { type: 'ai-visibility.report', payload: { workspaceId: ws.id, month }, idempotencyKey: `air-${ws.id}`, workspaceId: ws.id, runAt: FUTURE });
    await aiReportHandler({ db: db(), storage, jobId: job.id, workspaceId: ws.id, orderItemId: null, payload: { workspaceId: ws.id, month }, computeRateMillicentsPerS: 1 });
    const d = await db().generatedDeliverable.findFirstOrThrow({ where: { workspaceId: ws.id, kind: 'ai-visibility-report' } });
    expect(d.fileName).toBe('ai-visibility-report-2026-10.pdf');
    const p = path.join(mkdtempSync(path.join(tmpdir(), 'roi-aivp-')), 'r.pdf');
    writeFileSync(p, await storage.get('private', d.storageKey));
    const text = execFileSync('pdftotext', ['-layout', p, '-']).toString();
    expect(text).toContain('Mention rate across engines: 50%');
    expect(text).toContain('+50 points vs previous month');
    expect(text).toContain('ChatGPT: 100% mentioned in 1 check(s), average position 2');
    expect(text).toContain('Add LocalBusiness schema');
    expect(text).not.toMatch(/guarantee top ranking/i); // claims filter drops banned wording
    expect(await db().notification.count({ where: { userId: user.id } })).toBe(1);
  });
});
