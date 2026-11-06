import type { PrismaClient } from '@roi/database';
import { formatUsd } from '@roi/shared-utils';

/**
 * ROI built-in assistant (spec §13) — no external AI API.
 * Retrieval: PostgreSQL full-text search over knowledge_chunks (scoped to global + the caller's workspace + audience).
 * Intent routing: rules → read-only, permission-scoped tools that run AS the asking user.
 * Generation: deterministic templated answers with citations. Retrieved text is data, never instructions.
 */
export type Intent = 'greeting' | 'order_status' | 'subscription_status' | 'deliverables' | 'domain_status' | 'human' | 'out_of_scope' | 'knowledge';

export interface AskContext {
  userId?: string | null;
  role?: string | null;
  workspaceId?: string | null; // resolved by the caller from the session; never from user input
  audience?: 'CUSTOMER' | 'STAFF' | 'CLIENT_WIDGET';
}
export interface AssistantAnswer {
  intent: Intent;
  answer: string;
  citations: Array<{ title: string; url: string }>;
  toolCalls: Array<{ tool: string; input: object; output: object; allowed: boolean; durationMs: number }>;
}

const OUT_OF_SCOPE = /\b(diagnos|prescri|medication|dosage|lawsuit|sue\b|legal advice|tax advice|invest(ment)? advice|stock pick|crypto|weapon|bomb|hack|password of|someone else'?s account)\b/i;

export function classifyIntent(msg: string): Intent {
  const m = msg.toLowerCase();
  if (/^\s*(hi|hello|hey|good (morning|afternoon|evening)|yo)\b[\s!.?]*$/.test(m)) return 'greeting';
  if (OUT_OF_SCOPE.test(m)) return 'out_of_scope';
  if (/\b(human|real person|agent|talk to (someone|support)|call me|support ticket)\b/.test(m)) return 'human';
  if (/\b(my|our)\b.*\b(order|purchase)s?\b|\border (status|number)\b|\bwhere is my\b/.test(m)) return 'order_status';
  if (/\b(my|our)\b.*\b(subscription|plan|renewal|billing)\b|\bwhen (do|does) .* renew/.test(m)) return 'subscription_status';
  if (/\b(my|our)\b.*\b(files?|downloads?|deliverables?|gif|logo files?)\b|\bdownload my\b/.test(m)) return 'deliverables';
  if (/\b(my|our)\b.*\b(domain|website|site|ssl)\b/.test(m)) return 'domain_status';
  return 'knowledge';
}

function tsQuery(msg: string) {
  const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'is', 'are', 'do', 'does', 'i', 'you', 'my', 'me', 'can', 'what', 'how', 'with', 'your', 'it', 'be', 'about', 'roi']);
  const words = msg.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).slice(0, 12);
  return words.map((w) => w.replace(/-/g, '')).filter(Boolean).join(' | ');
}

export async function retrieve(db: PrismaClient, msg: string, ctx: AskContext, limit = 4) {
  const q = tsQuery(msg);
  if (!q) return [];
  const audiences = ctx.audience === 'STAFF' ? ['CUSTOMER', 'STAFF'] : [ctx.audience ?? 'CUSTOMER'];
  return db.$queryRaw<Array<{ id: string; heading: string | null; content: string; title: string; url: string | null; rank: number }>>`
    SELECT c.id, c.heading, c.content, d.title, d.url,
      ts_rank(to_tsvector('english', coalesce(c.heading,'') || ' ' || c.content), to_tsquery('english', ${q})) AS rank
    FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c."documentId"
    WHERE (c."workspaceId" IS NULL OR c."workspaceId" = ${ctx.workspaceId ?? '__none__'})
      AND c.audience = ANY(${audiences})
      AND to_tsvector('english', coalesce(c.heading,'') || ' ' || c.content) @@ to_tsquery('english', ${q})
    ORDER BY rank DESC LIMIT ${limit}`;
}

async function timed<T extends object>(tool: string, input: object, allowed: boolean, fn: () => Promise<T>) {
  const t = Date.now();
  const output = allowed ? await fn() : ({ denied: true } as unknown as T);
  return { call: { tool, input, output, allowed, durationMs: Date.now() - t }, output };
}

export async function ask(db: PrismaClient, message: string, ctx: AskContext): Promise<AssistantAnswer> {
  const msg = message.slice(0, 500);
  const intent = classifyIntent(msg);
  const signedIn = !!ctx.userId && !!ctx.workspaceId;
  const toolCalls: AssistantAnswer['toolCalls'] = [];

  if (intent === 'greeting') {
    return { intent, answer: 'Hello! I can explain ROI’s products and prices, help you get recommended by AI assistants, and — once you are signed in — check your orders, files, subscriptions and website.', citations: [], toolCalls };
  }
  if (intent === 'out_of_scope') {
    return { intent, answer: 'I can only help with ROI’s products, your ROI account and marketing questions. For medical, legal, tax or investment matters please consult a licensed professional.', citations: [], toolCalls };
  }
  if (intent === 'human') {
    return { intent, answer: signedIn ? 'I can hand this to our team. Open Support in your dashboard and create a ticket — a manager will reply, usually within one business day.' : 'You can reach our team at roictllc@gmail.com or through the contact form at /contact.', citations: [{ title: 'Contact', url: signedIn ? '/dashboard/support' : '/contact' }], toolCalls };
  }

  if (['order_status', 'subscription_status', 'deliverables', 'domain_status'].includes(intent)) {
    if (!signedIn) {
      return { intent, answer: 'Please sign in so I can look that up for you — I can only see information for your own account.', citations: [{ title: 'Sign in', url: '/login' }], toolCalls };
    }
    const ws = ctx.workspaceId!;
    if (intent === 'order_status') {
      const { call, output } = await timed('order_lookup', { workspaceId: ws }, true, async () => ({
        orders: await db.order.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: 'desc' }, take: 5, select: { orderNumber: true, status: true, totalCents: true, createdAt: true, items: { select: { product: { select: { name: true } }, status: true } } } }),
      }));
      toolCalls.push(call);
      const o = (output as { orders: Array<{ orderNumber: string; status: string; totalCents: number; createdAt: Date; items: Array<{ product: { name: string }; status: string }> }> }).orders;
      return { intent, answer: o.length ? `Your latest orders:\n${o.map((x) => `• ${x.orderNumber} — ${x.items.map((i) => i.product.name).join(', ')} — ${x.status.replace(/_/g, ' ').toLowerCase()} (${formatUsd(x.totalCents)})`).join('\n')}` : 'You have no orders yet.', citations: [{ title: 'Orders', url: '/dashboard/orders' }], toolCalls };
    }
    if (intent === 'subscription_status') {
      const { call, output } = await timed('subscription_status', { workspaceId: ws }, true, async () => ({
        subs: await db.subscription.findMany({ where: { workspaceId: ws }, select: { status: true, currentPeriodEnd: true, price: { select: { amountCents: true, interval: true, plan: { select: { name: true, product: { select: { name: true } } } } } } } }),
      }));
      toolCalls.push(call);
      const s = (output as { subs: Array<{ status: string; currentPeriodEnd: Date | null; price: { amountCents: number; interval: string; plan: { name: string; product: { name: string } } } }> }).subs;
      return { intent, answer: s.length ? s.map((x) => `• ${x.price.plan.product.name} (${x.price.plan.name}) — ${x.status.toLowerCase()}, ${formatUsd(x.price.amountCents)}/${x.price.interval === 'YEAR' ? 'year' : 'month'}${x.currentPeriodEnd ? `, renews ${x.currentPeriodEnd.toISOString().slice(0, 10)}` : ''}`).join('\n') : 'You have no active subscriptions.', citations: [{ title: 'Billing', url: '/dashboard/billing' }], toolCalls };
    }
    if (intent === 'deliverables') {
      const { call, output } = await timed('deliverable_links', { workspaceId: ws }, true, async () => ({
        files: await db.generatedDeliverable.findMany({ where: { workspaceId: ws, isPreview: false }, orderBy: { createdAt: 'desc' }, take: 8, select: { fileName: true, kind: true, createdAt: true } }),
      }));
      toolCalls.push(call);
      const f = (output as { files: Array<{ fileName: string; kind: string }> }).files;
      return { intent, answer: f.length ? `Your latest files:\n${f.map((x) => `• ${x.fileName} (${x.kind})`).join('\n')}\nDownload them from Products & downloads.` : 'No delivered files yet. Files appear here as soon as they pass our quality checks.', citations: [{ title: 'Downloads', url: '/dashboard/products' }], toolCalls };
    }
    const { call, output } = await timed('domain_status', { workspaceId: ws }, true, async () => ({
      domains: await db.domain.findMany({ where: { workspaceId: ws }, select: { name: true, status: true, expiresAt: true, coveredByRoi: true } }),
      sites: await db.website.findMany({ where: { workspaceId: ws, archivedAt: null }, select: { name: true, status: true, liveUrl: true } }),
    }));
    toolCalls.push(call);
    const o = output as { domains: Array<{ name: string; status: string; expiresAt: Date | null; coveredByRoi: boolean }>; sites: Array<{ name: string; status: string; liveUrl: string | null }> };
    const lines = [...o.sites.map((s) => `• Website “${s.name}”: ${s.status.toLowerCase()}${s.liveUrl ? ` at ${s.liveUrl}` : ''}`), ...o.domains.map((d) => `• ${d.name}: ${d.status.toLowerCase()}${d.expiresAt ? `, renews ${d.expiresAt.toISOString().slice(0, 10)}` : ''} (${d.coveredByRoi ? 'covered by ROI' : 'paid by you'})`)];
    return { intent, answer: lines.length ? lines.join('\n') : 'You have no websites or domains yet.', citations: [{ title: 'My website', url: '/dashboard/website' }], toolCalls };
  }

  const hits = await retrieve(db, msg, ctx);
  if (!hits.length) {
    return { intent, answer: 'I don’t have a confident answer to that. You can browse our products at /products, or ask our team via /contact — I’d rather point you to a person than guess.', citations: [{ title: 'Products', url: '/products' }], toolCalls };
  }
  const top = hits.slice(0, 2);
  const seen = new Set<string>();
  const citations = hits.filter((h) => (seen.has(h.title) ? false : (seen.add(h.title), true))).slice(0, 3).map((h) => ({ title: h.title, url: h.url ?? '/' }));
  return { intent, answer: top.map((h) => h.content).join('\n\n'), citations, toolCalls };
}
