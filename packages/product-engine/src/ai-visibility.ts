import type { PrismaClient } from '@roi/database';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { storeDeliverable, type Handler } from './handlers';
import { log } from './queue';
import { sendEmailFromWorker } from './notify';

/**
 * Product 11 — AI Visibility tracking + monthly report (spec §12). Mention checks come only from compliant sources:
 * official APIs where allowed, or manual checks logged by ROI staff (method = "manual", with who and when).
 * Every number in the dashboard/report carries its data age; the report never promises mentions or rankings.
 */
export const AI_ENGINES = [
  { key: 'chatgpt', label: 'ChatGPT' }, { key: 'gemini', label: 'Gemini' }, { key: 'claude', label: 'Claude' },
  { key: 'perplexity', label: 'Perplexity' }, { key: 'copilot', label: 'Copilot' }, { key: 'google-ai-overviews', label: 'Google AI Overviews' },
] as const;
export const engineLabel = (k: string) => AI_ENGINES.find((e) => e.key === k)?.label ?? k;

type Check = { engine: string; mentioned: boolean; position: number | null; checkedAt: Date; method: string };

/** Mention rate per engine for a period, plus an 8-week weekly trend (null weeks have no data). */
export function mentionStats(checks: Check[], now = new Date(), days = 30) {
  const since = now.getTime() - days * 86_400_000;
  const recent = checks.filter((c) => c.checkedAt.getTime() >= since);
  const perEngine = AI_ENGINES.map((e) => {
    const cs = recent.filter((c) => c.engine === e.key);
    const mentioned = cs.filter((c) => c.mentioned);
    const positions = mentioned.map((c) => c.position).filter((p): p is number => p !== null);
    return { engine: e.key, label: e.label, checks: cs.length, rate: cs.length ? Math.round((mentioned.length / cs.length) * 100) : null, avgPosition: positions.length ? +(positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1) : null, lastCheckedAt: cs.reduce<Date | null>((m, c) => (!m || c.checkedAt > m ? c.checkedAt : m), null) };
  });
  const overall = recent.length ? Math.round((recent.filter((c) => c.mentioned).length / recent.length) * 100) : null;
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const end = now.getTime() - (7 - i) * 7 * 86_400_000;
    const cs = checks.filter((c) => c.checkedAt.getTime() > end - 7 * 86_400_000 && c.checkedAt.getTime() <= end);
    return cs.length ? Math.round((cs.filter((c) => c.mentioned).length / cs.length) * 100) : null;
  });
  return { overall, perEngine, weekly, checks: recent.length, newest: recent.reduce<Date | null>((m, c) => (!m || c.checkedAt > m ? c.checkedAt : m), null) };
}

const BANNED = /\b(guarantee[sd]?|guaranteed|promise[sd]?|#1 ranking|top ranking)\b/i;

/** Monthly report PDF built only from stored results (spec Product 11 step 4). */
export async function buildAiVisibilityReport(db: PrismaClient, workspaceId: string, month: string) {
  const ws = await db.businessWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const [y, m] = month.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 1));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const prevStart = new Date(Date.UTC(y, m - 2, 1));
  const questions = await db.aiTrackedQuestion.findMany({ where: { workspaceId, active: true }, include: { checks: { where: { checkedAt: { gte: prevStart, lt: end } } } } });
  const all = questions.flatMap((q) => q.checks);
  const cur = mentionStats(all.filter((c) => c.checkedAt >= start), end, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const prev = mentionStats(all.filter((c) => c.checkedAt < start), start, Math.round((start.getTime() - prevStart.getTime()) / 86_400_000));
  const audit = await db.aiVisibilityAudit.findFirst({ where: { workspaceId, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } });
  const fixes = ((audit?.fixes as Array<{ title?: string; impact?: string }> | null) ?? []).slice(0, 5);

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]);
  let y0 = 740;
  const text = (s: string, o: { size?: number; b?: boolean; color?: [number, number, number] } = {}) => {
    if (y0 < 70) {
      page = doc.addPage([612, 792]);
      y0 = 740;
    }
    const clean = s.replace(/[^\x20-\x7E]/g, (ch) => ({ '—': '-', '–': '-', '’': "'", '“': '"', '”': '"', '…': '...', '·': '-' })[ch] ?? '');
    page.drawText(clean.slice(0, 110), { x: 50, y: y0, size: o.size ?? 11, font: o.b ? bold : font, color: o.color ? rgb(...o.color) : rgb(0.1, 0.12, 0.2) });
    y0 -= (o.size ?? 11) + 8;
  };
  text(`${ws.name} - AI Visibility report`, { size: 20, b: true });
  text(`${start.toISOString().slice(0, 7)} | generated ${new Date().toISOString().slice(0, 10)} by ROI`, { size: 10, color: [0.4, 0.42, 0.5] });
  y0 -= 6;
  text('Summary', { size: 14, b: true });
  text(`AI visibility score: ${audit?.score ?? 'no audit yet'}${audit ? ` (audit of ${audit.createdAt.toISOString().slice(0, 10)})` : ''}`);
  const delta = cur.overall !== null && prev.overall !== null ? cur.overall - prev.overall : null;
  text(`Mention rate across engines: ${cur.overall === null ? 'no checks this month' : `${cur.overall}%`}${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta} points vs previous month)` : ''}`);
  text(`Checks recorded: ${cur.checks} for ${questions.length} tracked question(s). Newest data: ${cur.newest ? cur.newest.toISOString().slice(0, 10) : '-'}`);
  y0 -= 6;
  text('By engine (measured, with data age)', { size: 14, b: true });
  for (const e of cur.perEngine) text(`${e.label}: ${e.rate === null ? 'not checked' : `${e.rate}% mentioned in ${e.checks} check(s)`}${e.avgPosition ? `, average position ${e.avgPosition}` : ''}${e.lastCheckedAt ? `, last checked ${e.lastCheckedAt.toISOString().slice(0, 10)}` : ''}`);
  y0 -= 6;
  text('Tracked questions', { size: 14, b: true });
  for (const q of questions.slice(0, 25)) {
    const cs = q.checks.filter((c) => c.checkedAt >= start);
    const hit = cs.filter((c) => c.mentioned).length;
    text(`"${q.question}" - ${cs.length ? `mentioned in ${hit}/${cs.length}` : 'no checks this month'}`, { size: 10 });
  }
  y0 -= 6;
  text('Next best actions', { size: 14, b: true });
  if (!fixes.length) text('Run an AI visibility audit to get a prioritized fix list.');
  for (const f of fixes) if (f.title && !BANNED.test(f.title)) text(`- ${f.title}${f.impact ? ` (impact: ${f.impact})` : ''}`, { size: 10 });
  y0 -= 10;
  text('How to read this report', { size: 12, b: true });
  text('No company can force an AI engine to recommend a business. ROI improves how AI systems understand and surface you,', { size: 9, color: [0.4, 0.42, 0.5] });
  text('and measures results only through official APIs where allowed or checks logged by ROI staff, each with its date.', { size: 9, color: [0.4, 0.42, 0.5] });
  doc.setTitle(`${ws.name} AI Visibility report ${month}`);
  doc.setProducer('ROI LLC');
  return { pdf: Buffer.from(await doc.save()), summary: { overall: cur.overall, previous: prev.overall, checks: cur.checks, questions: questions.length } };
}

/** Per-workspace report job (payload: workspaceId, month YYYY-MM; default = previous month). */
export const aiReportHandler: Handler = async (ctx) => {
  const p = ctx.payload as { workspaceId: string; month?: string };
  const d = new Date();
  const month = p.month ?? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const { pdf, summary } = await buildAiVisibilityReport(ctx.db, p.workspaceId, month);
  const owner = await ctx.db.businessWorkspace.findUniqueOrThrow({ where: { id: p.workspaceId }, include: { owner: true } });
  await storeDeliverable({ ...ctx, workspaceId: p.workspaceId, orderItemId: null }, { kind: 'ai-visibility-report', fileName: `ai-visibility-report-${month}.pdf`, body: pdf, mime: 'application/pdf', validation: { month, ...summary } });
  await sendEmailFromWorker(ctx.db, owner.owner.email, 'report-ready', { report: 'AI Visibility report', period: month, link: `${(process.env.APP_URL ?? '').replace(/\/$/, '')}/dashboard/ai-visibility` });
  await ctx.db.notification.create({ data: { userId: owner.ownerId, title: `AI Visibility report for ${month}`, body: summary.overall === null ? 'No mention checks were recorded this month.' : `Mention rate ${summary.overall}%.`, link: '/dashboard/ai-visibility' } });
  await log(ctx.db, ctx.jobId, 'info', 'AI visibility report built', { month, ...summary });
  return { deliverables: 1, costMillicents: 0 };
};

/** Monthly fan-out on the 1st: one report job per workspace with tracked questions. */
export const aiReportFanoutHandler: Handler = async (ctx) => {
  const d = new Date();
  const month = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const wss = await ctx.db.aiTrackedQuestion.findMany({ where: { active: true }, distinct: ['workspaceId'], select: { workspaceId: true } });
  const r = await ctx.db.automationJob.createMany({ data: wss.map((w) => ({ type: 'ai-visibility.report', lane: 'housekeeping', priority: 80, workspaceId: w.workspaceId, payload: { workspaceId: w.workspaceId, month }, idempotencyKey: `ai-report:${w.workspaceId}:${month}` })), skipDuplicates: true });
  await log(ctx.db, ctx.jobId, 'info', 'Monthly AI reports queued', { month, queued: r.count });
  return { deliverables: 0, costMillicents: 0 };
};

export const AI_VISIBILITY_HANDLERS: Record<string, Handler> = {
  'ai-visibility.report': aiReportHandler,
  'ai-visibility.monthly-reports': aiReportFanoutHandler,
};
