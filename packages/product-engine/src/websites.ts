import { createHash } from 'node:crypto';
import type { PrismaClient } from '@roi/database';
import { generateUniqueSite, qualityGate, type SiteInput } from '../../site-generator/src/generate';
import { cloudflarePages, pagesProjectName, roiHost, CF_LIMITS, type HostingProvider } from '../../site-generator/src/hosting';
import { finishOrderItem, inputsFor, type Handler } from './handlers';
import { log, step } from './queue';
import { sendEmailFromWorker } from './notify';
import type { StorageProvider } from './storage';

/**
 * Product 5 — Instant Landing Page + Hosting (spec §12).
 * buildWebsiteVersion: business details → unique site (shingle check against every other ROI site) → quality gate →
 * immutable versioned bundle in storage. Generation is pure and fast, so the customer sees the preview immediately.
 * Publishing (paid job or "publish this version") deploys a version through the HostingProvider and records the
 * deployment; rollback is simply publishing an older version.
 */
export type WebsiteInput = Omit<SiteInput, 'siteId' | 'apiOrigin' | 'logoUrl' | 'domain'> & { logoAssetId?: string };

export async function buildWebsiteVersion(db: PrismaClient, storage: StorageProvider, a: { workspaceId: string; websiteId?: string; input: WebsiteInput; actorId: string; apiOrigin: string; notes?: string }) {
  const website =
    (a.websiteId ? await db.website.findFirst({ where: { id: a.websiteId, workspaceId: a.workspaceId } }) : null) ??
    (await db.website.create({ data: { workspaceId: a.workspaceId, name: a.input.businessName, industry: a.input.industry, status: 'DRAFT', design: { design: a.input.design, colors: a.input.colors }, content: {} } }));
  const domain = await db.domain.findFirst({ where: { websiteId: website.id, OR: [{ status: 'ACTIVE' }, { status: 'EXTERNAL' }] } });
  const others = await db.website.findMany({ where: { id: { not: website.id }, archivedAt: null }, select: { content: true }, orderBy: { updatedAt: 'desc' }, take: 1000 });
  const otherTexts = others.map((o) => (o.content as { homeText?: string } | null)?.homeText).filter((t): t is string => !!t);
  const siteInput: SiteInput = { ...a.input, siteId: website.id, apiOrigin: a.apiOrigin, domain: domain?.name };
  const started = Date.now();
  const r = generateUniqueSite(siteInput, otherTexts);
  const gate = qualityGate(r.site, siteInput);
  if (!gate.ok) return { ok: false as const, websiteId: website.id, problems: gate.problems };
  const bundle = Buffer.from(JSON.stringify({ files: r.site.files, pages: r.site.pages }));
  const contentHash = createHash('sha256').update(bundle).digest('hex');
  const last = await db.websiteVersion.findFirst({ where: { websiteId: website.id }, orderBy: { version: 'desc' } });
  if (last?.contentHash === contentHash) return { ok: true as const, websiteId: website.id, version: last, ms: Date.now() - started, similarity: r.worst, unchanged: true };
  const n = (last?.version ?? 0) + 1;
  const bundleKey = `sites/${website.id}/v${n}-${contentHash.slice(0, 10)}.json`;
  await storage.put('private', bundleKey, bundle, 'application/json');
  const version = await db.websiteVersion.create({ data: { websiteId: website.id, version: n, bundleKey, contentHash, notes: r.needsManagerReview ? `NEEDS_REVIEW: text too close to another ROI site (similarity ${r.worst.toFixed(2)})` : a.notes ?? (n === 1 ? 'First version' : 'Edited'), createdById: a.actorId } });
  await db.website.update({ where: { id: website.id }, data: { name: a.input.businessName, industry: a.input.industry, design: { design: a.input.design, colors: a.input.colors }, content: { input: a.input, homeText: r.site.homeText } as object, status: website.status === 'DRAFT' ? 'PREVIEW' : website.status } });
  return { ok: true as const, websiteId: website.id, version, ms: Date.now() - started, similarity: r.worst, needsManagerReview: r.needsManagerReview, unchanged: false };
}

/** Loads a version bundle (cached per key: bundles are immutable). */
const cache = new Map<string, { files: Record<string, string>; pages: string[] }>();
export async function loadBundle(storage: StorageProvider, bundleKey: string) {
  const hit = cache.get(bundleKey);
  if (hit) return hit;
  const b = JSON.parse((await storage.get('private', bundleKey)).toString('utf8')) as { files: Record<string, string>; pages: string[] };
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(bundleKey, b);
  return b;
}

/** Maps a request path to a bundle file ("/" → index.html, "/services/x/" → services/x/index.html). */
export function resolveSitePath(files: Record<string, string>, pathname: string) {
  const p = decodeURIComponent(pathname).replace(/^\/+/, '').replace(/\.\.+/g, '');
  const candidates = p === '' ? ['index.html'] : p.endsWith('/') ? [`${p}index.html`] : [p, `${p}/index.html`];
  for (const c of candidates) if (c in files) return { file: c, status: 200 };
  return { file: '404.html' in files ? '404.html' : null, status: 404 };
}

/** Provider choice: Cloudflare Pages while the account has room, otherwise ROI's own host (spec Product 5). */
export async function pickHostingProvider(db: PrismaClient): Promise<HostingProvider> {
  const appOrigin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_PAGES_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (accountId && token) {
    const acct = await db.hostingAccount.upsert({ where: { provider_accountRef: { provider: 'cloudflare-pages', accountRef: accountId } }, update: {}, create: { provider: 'cloudflare-pages', accountRef: accountId, projectLimit: CF_LIMITS.projectsPerAccount, status: 'ACTIVE' } });
    if (acct.projectCount < (acct.projectLimit ?? CF_LIMITS.projectsPerAccount) - 5) return cloudflarePages({ accountId, apiToken: token });
  }
  const target = process.env.ROI_SITE_HOST_TARGET;
  if (!target) throw new Error('AWAITING_CONFIGURATION: set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_PAGES_TOKEN, or ROI_SITE_HOST_TARGET for the ROI host (VPS).');
  return roiHost({ appOrigin, hostTarget: target });
}

export async function publishWebsiteVersion(db: PrismaClient, storage: StorageProvider, a: { websiteId: string; versionId?: string; jobId?: string }) {
  const website = await db.website.findUniqueOrThrow({ where: { id: a.websiteId }, include: { workspace: { include: { owner: true } } } });
  const version = a.versionId ? await db.websiteVersion.findFirstOrThrow({ where: { id: a.versionId, websiteId: website.id } }) : await db.websiteVersion.findFirstOrThrow({ where: { websiteId: website.id }, orderBy: { version: 'desc' } });
  const provider = await pickHostingProvider(db);
  const bundle = await loadBundle(storage, version.bundleKey);
  const projectName = (website.hostingProvider === 'cloudflare-pages' && (website.design as { projectName?: string }).projectName) || pagesProjectName(website.id, website.name);
  const dep = await db.websiteDeployment.create({ data: { websiteId: website.id, versionId: version.id, provider: provider.name, status: 'DEPLOYING', startedAt: new Date() } });
  await db.website.update({ where: { id: website.id }, data: { status: 'PUBLISHING' } });
  try {
    const r = await provider.deploy({ websiteId: website.id, projectName }, bundle.files);
    if (provider.name === 'cloudflare-pages' && website.hostingProvider !== 'cloudflare-pages') {
      await db.hostingAccount.updateMany({ where: { provider: 'cloudflare-pages', accountRef: process.env.CLOUDFLARE_ACCOUNT_ID }, data: { projectCount: { increment: 1 } } });
    }
    await db.$transaction([
      db.websiteDeployment.updateMany({ where: { websiteId: website.id, status: 'LIVE', id: { not: dep.id } }, data: { status: 'SUPERSEDED' } }),
      db.websiteDeployment.update({ where: { id: dep.id }, data: { status: 'LIVE', providerDeploymentId: r.providerDeploymentId, url: r.url, log: r.log, finishedAt: new Date() } }),
      db.website.update({ where: { id: website.id }, data: { status: 'LIVE', hostingProvider: provider.name, previewUrl: r.url, design: { ...(website.design as object), projectName } } }),
    ]);
    const domain = await db.domain.findFirst({ where: { websiteId: website.id, OR: [{ status: 'ACTIVE' }, { status: 'EXTERNAL' }] } });
    // Public URL: the verified domain; on Cloudflare also the pages.dev address. The ROI host is only public on a domain.
    const liveUrl = domain && (domain.verification as { verifiedAt?: string } | null)?.verifiedAt ? `https://${domain.name}` : provider.name === 'cloudflare-pages' ? r.url : null;
    await db.website.update({ where: { id: website.id }, data: { liveUrl } });
    if (a.jobId) await log(db, a.jobId, 'info', 'Website published', { provider: provider.name, version: version.version, url: liveUrl });
    if (liveUrl) await sendEmailFromWorker(db, website.workspace.owner.email, 'website-live', { domain: liveUrl.replace(/^https?:\/\//, ''), link: liveUrl });
    return { provider: provider.name, url: liveUrl ?? r.url, version: version.version };
  } catch (e) {
    await db.websiteDeployment.update({ where: { id: dep.id }, data: { status: 'FAILED', log: [(e as Error).message], finishedAt: new Date() } });
    await db.website.update({ where: { id: website.id }, data: { status: website.status === 'LIVE' ? 'LIVE' : 'PREVIEW' } });
    throw e;
  }
}

/** Paid job after the first subscription payment, and the "publish/rollback" job from the editor. */
export const websiteSubscriptionHandler: Handler = async (ctx) => {
  const started = Date.now();
  const inputs = (await inputsFor(ctx)) as { websiteId: string };
  const item = await ctx.db.orderItem.findUniqueOrThrow({ where: { id: ctx.orderItemId! }, include: { order: true } });
  const sub = await ctx.db.subscription.findFirst({ where: { workspaceId: ctx.workspaceId, status: { in: ['ACTIVE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' } });
  if (sub) await ctx.db.website.updateMany({ where: { id: inputs.websiteId, workspaceId: ctx.workspaceId }, data: { subscriptionId: sub.id } });
  await step(ctx.db, ctx.jobId, 'publish', { websiteId: inputs.websiteId }, () => publishWebsiteVersion(ctx.db, ctx.storage, { websiteId: inputs.websiteId, jobId: ctx.jobId }));
  return { deliverables: 0, costMillicents: await finishOrderItem(ctx, item.productId, 100, started) };
};

export const websitePublishHandler: Handler = async (ctx) => {
  const p = ctx.payload as { websiteId: string; versionId?: string };
  const w = await ctx.db.website.findFirstOrThrow({ where: { id: p.websiteId, workspaceId: ctx.workspaceId } });
  if (!w.subscriptionId) throw new Error('No active website subscription');
  await step(ctx.db, ctx.jobId, 'publish', { versionId: p.versionId ?? 'latest' }, () => publishWebsiteVersion(ctx.db, ctx.storage, { websiteId: w.id, versionId: p.versionId, jobId: ctx.jobId }));
  return { deliverables: 0, costMillicents: 0 };
};

export const WEBSITE_HANDLERS: Record<string, Handler> = {
  'product.landing-page-hosting': websiteSubscriptionHandler,
  'website.publish': websitePublishHandler,
};
