/**
 * Idempotent seed (spec §22-1): catalog, categories, roles/permissions, integrations, flags, settings, templates,
 * reference data. It only INSERTS missing rows — it never overwrites anything the admin has edited — and creates
 * no fake customers, orders, reviews or analytics. The first ADMIN is created only when no ADMIN exists, from
 * SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD_HASH (argon2id) or SEED_ADMIN_PASSWORD; it must change the password and
 * enroll 2FA at first sign-in.
 */
import { createPrisma } from '../src/index';
import { CATALOG, CATEGORIES } from '../../product-engine/src/catalog';
import { SIGNATURE_TEMPLATES } from '../../product-engine/src/signature-templates';
import { PERMISSIONS, ROLES, defaultGrants } from '../../shared-types/src/index';
import { INTEGRATIONS, missingEnv } from '../../integrations/src/registry';
import { TEMPLATES } from '../../email-templates/src/index';
import { FORMS } from '../../validation/src/index';
import { DEFAULT_COST_MODEL, hashPassword, randomToken } from '../../shared-utils/src/index';
import { US_STATES } from './us-states';
import { LEGAL_DOCS } from '../../product-engine/src/legal';
import { ROI_KNOWLEDGE } from './knowledge';

export const SETTINGS: Array<{ key: string; value: unknown; description: string }> = [
  { key: 'company', value: { name: 'ROI LLC', brand: 'ROI', tagline: 'Your Investment. Our Intelligence. Measurable Growth.', email: 'roictllc@gmail.com', domain: 'roictllc.com', foundingYear: 2026, country: 'US', postalAddress: '' }, description: 'Entity facts used on every page and in schema (postal address required for marketing email).' },
  { key: 'domain.policy', value: { thresholdCents: 1500, handlingFeeCents: 0, allowPremium: false }, description: 'Domain rule: < threshold ROI pays; ≥ threshold customer pays full.' },
  { key: 'billing.graceDays', value: 7, description: 'Days after a failed payment before a site is suspended.' },
  { key: 'billing.dataRetentionDays', value: 90, description: 'Days suspended-site data is kept.' },
  { key: 'margin.minBps', value: 4000, description: 'Default minimum contribution margin (basis points).' },
  { key: 'ebook.downloadLimit', value: 5, description: 'Downloads per purchased e-book.' },
  { key: 'signatures.maxEmployees', value: 50, description: 'Employees per Email Signature Suite order.' },
  { key: 'signatures.assetRetentionMonths', value: 24, description: 'Months hosted signature assets stay online.' },
  { key: 'previews.dailyLimit', value: { gif: 10, revival: 3, logo: 5 }, description: 'Free previews per verified account per day.' },
  { key: 'refund.policy', value: { subscriptionWindowDays: 14, automatedFailureAutoRefund: true, domainFeesRefundable: false }, description: 'Refund rules shown at checkout.' },
  { key: 'affiliate.attributionDays', value: 30, description: 'Last-click attribution window.' },
  { key: 'affiliate.holdDays', value: 45, description: 'Commission hold before payable (refund/chargeback window).' },
  { key: 'social.livePollSeconds', value: 120, description: 'Polling interval for platforms without webhooks.' },
  { key: 'geo.maxPagesPerMonth', value: 8, description: 'Location pages published per site per month (anti-doorway).' },
  { key: 'privacy.retention', value: { loginAttemptsDays: 90, auditLogYears: 7, assistantDays: 365 }, description: 'Data retention schedule.' },
  { key: 'checkout.consentText', value: 'I agree that delivery begins immediately and accept the Terms and Refund Policy.', description: 'Consent line shown at checkout.' },
];

const FLAGS: Array<{ key: string; visibility: 'HIDDEN' | 'COMING_SOON' | 'LIVE'; description: string }> = [
  { key: 'checkout', visibility: 'HIDDEN', description: 'Stripe checkout (LIVE requires the Stripe integration to be CONNECTED).' },
  { key: 'signup', visibility: 'LIVE', description: 'Public customer registration.' },
  { key: 'ai_visibility.free_audit', visibility: 'LIVE', description: 'Free AI Visibility audit (runs inside ROI, no external API).' },
  { key: 'assistant.public', visibility: 'LIVE', description: 'Built-in ROI assistant on public pages.' },
  { key: 'social.facebook', visibility: 'HIDDEN', description: 'Facebook Pages connection.' },
  { key: 'social.instagram', visibility: 'HIDDEN', description: 'Instagram connection.' },
  { key: 'social.tiktok', visibility: 'HIDDEN', description: 'TikTok connection.' },
  { key: 'social.x', visibility: 'HIDDEN', description: 'X connection.' },
  { key: 'domains.search', visibility: 'HIDDEN', description: 'Domain search and registration.' },
  { key: 'uploads', visibility: 'HIDDEN', description: 'Customer uploads (needs R2).' },
];

export async function seed(opts: { log?: (s: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const prisma = createPrisma(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
  const counts: Record<string, number> = {};
  const inc = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  try {
    // Roles & permissions
    for (const r of ROLES) {
      await prisma.role.upsert({ where: { name: r }, update: {}, create: { name: r, description: `${r} role` } });
    }
    for (const [key, p] of Object.entries(PERMISSIONS)) {
      await prisma.permission.upsert({ where: { key }, update: { description: p.description }, create: { key, description: p.description } });
    }
    for (const r of ROLES) {
      for (const key of defaultGrants(r)) {
        const exists = await prisma.rolePermission.findUnique({ where: { roleName_permissionKey: { roleName: r, permissionKey: key } } });
        if (!exists) {
          await prisma.rolePermission.create({ data: { roleName: r, permissionKey: key } });
          inc('rolePermissions');
        }
      }
    }

    // Catalog
    const catIds: Record<string, string> = {};
    for (const c of CATEGORIES) {
      const row = await prisma.productCategory.upsert({ where: { slug: c.slug }, update: {}, create: { slug: c.slug, name: c.name, sortOrder: c.sortOrder } });
      catIds[c.slug] = row.id;
    }
    for (const [i, p] of CATALOG.entries()) {
      let product = await prisma.product.findUnique({ where: { slug: p.slug } });
      if (!product) {
        product = await prisma.product.create({
          data: {
            number: p.number, slug: p.slug, name: p.name, tagline: p.tagline, shortDescription: p.shortDescription, longDescription: p.longDescription,
            answerFirst: p.answerFirst, categoryId: catIds[p.category], kind: p.kind, deliveryMode: p.deliveryMode,
            // Marketing page visible, purchase disabled until LIVE (requires connected integrations) — DECISIONS.md D-07.
            visibility: 'COMING_SOON', requiredIntegrations: p.requiredIntegrations, faq: p.faq, honesty: p.honesty, taxCode: p.taxCode,
            seoTitle: `${p.name} | ROI`, seoDescription: p.shortDescription.slice(0, 155), sortOrder: i,
          },
        });
        inc('products');
      }
      for (const [j, plan] of p.plans.entries()) {
        let planRow = await prisma.productPlan.findUnique({ where: { productId_slug: { productId: product.id, slug: plan.slug } } });
        if (!planRow) {
          planRow = await prisma.productPlan.create({
            data: { productId: product.id, slug: plan.slug, name: plan.name, description: plan.description, isDefault: !!plan.isDefault, published: plan.published ?? true, sortOrder: j },
          });
          inc('plans');
          for (const [k, text] of plan.features.entries()) {
            await prisma.productFeature.create({ data: { productId: product.id, planId: planRow.id, text, sortOrder: k } });
          }
        }
        if (plan.amountCents !== null) {
          const hasPrice = await prisma.productPrice.findFirst({ where: { planId: planRow.id } });
          if (!hasPrice) {
            await prisma.productPrice.create({ data: { planId: planRow.id, version: 1, amountCents: plan.amountCents, interval: plan.interval, reason: 'Seed price (spec v4)' } });
            inc('prices');
          }
        }
      }
      if (!(await prisma.productCostModel.findUnique({ where: { productId: product.id } }))) {
        await prisma.productCostModel.create({ data: { productId: product.id, ...DEFAULT_COST_MODEL, ...p.cost, minMarginBps: 4000 } });
      }
      if (!(await prisma.productWorkflow.findUnique({ where: { productId: product.id } }))) {
        await prisma.productWorkflow.create({ data: { productId: product.id, steps: p.workflow } });
      }
      if (FORMS[p.slug] && !(await prisma.productForm.findUnique({ where: { productId: product.id } }))) {
        await prisma.productForm.create({ data: { productId: product.id, schema: FORMS[p.slug] as object } });
      }
    }

    // Social plans (drafts; admin publishes after setting prices with the margin guard)
    const social = CATALOG.find((p) => p.slug === 'social-autopilot')!;
    const socialSpecs: Record<string, { posts: number; platforms: Array<'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'X'>; images: number; depth: string }> = {
      starter: { posts: 12, platforms: ['FACEBOOK', 'INSTAGRAM'], images: 12, depth: 'basic' },
      growth: { posts: 30, platforms: ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X'], images: 30, depth: 'standard' },
      pro: { posts: 60, platforms: ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X'], images: 60, depth: 'advanced' },
    };
    for (const plan of social.plans) {
      const s = socialSpecs[plan.slug];
      await prisma.socialPlan.upsert({
        where: { slug: plan.slug }, update: {},
        create: { slug: plan.slug, name: plan.name, priceCents: plan.amountCents ?? 0, postsPerMonth: s.posts, platforms: s.platforms, imageCount: s.images, analyticsDepth: s.depth, approvalOptions: ['APPROVE_FIRST', 'AUTO_PUBLISH', 'MANAGER_REVIEW'], published: false },
      });
    }

    // Integrations (status computed from the current environment; live checks run from /admin/integrations and the worker)
    for (const d of INTEGRATIONS) {
      const missing = missingEnv(d);
      const existing = await prisma.integration.findUnique({ where: { key: d.key } });
      if (!existing) {
        await prisma.integration.create({
          data: { key: d.key, name: d.name, requiredEnv: d.requiredEnv, missingEnv: missing, unlocks: d.unlocks, ownerStep: d.ownerStep,
            status: d.key === 'database' ? 'CONNECTED' : 'AWAITING_CONFIGURATION' },
        });
        inc('integrations');
      } else {
        await prisma.integration.update({ where: { key: d.key }, data: { requiredEnv: d.requiredEnv, unlocks: d.unlocks, ownerStep: d.ownerStep, name: d.name } });
      }
    }

    for (const f of FLAGS) await prisma.featureFlag.upsert({ where: { key: f.key }, update: {}, create: f });
    for (const s of SETTINGS) await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: { key: s.key, value: s.value as object, description: s.description } });

    for (const t of TEMPLATES) {
      await prisma.emailTemplate.upsert({ where: { slug: t.slug }, update: {}, create: { slug: t.slug, name: t.name, kind: t.kind, subject: t.subject, html: t.body, text: t.body } });
    }
    for (const [i, t] of SIGNATURE_TEMPLATES.entries()) {
      await prisma.signatureTemplate.upsert({ where: { slug: t.slug }, update: {}, create: { slug: t.slug, name: t.name, sortOrder: i } });
    }
    for (const [slug, name] of [['motivation', 'Motivation'], ['success', 'Success'], ['business', 'Business'], ['finance', 'Finance'], ['leadership', 'Leadership'], ['marketing', 'Marketing'], ['productivity', 'Productivity'], ['self-improvement', 'Self-Improvement']]) {
      await prisma.eBookCategory.upsert({ where: { slug }, update: {}, create: { slug, name } });
    }
    for (const term of ['nike', 'apple', 'google', 'coca-cola', 'disney', 'starbucks', 'mcdonalds', 'amazon', 'microsoft', 'meta', 'tesla', 'chanel', 'gucci', 'louis vuitton']) {
      await prisma.blockedTerm.upsert({ where: { term }, update: {}, create: { term, kind: 'BRAND', severity: 'REVIEW' } });
    }
    for (const d of LEGAL_DOCS) {
      await prisma.legalDocument.upsert({ where: { slug: d.slug }, update: {}, create: d });
    }
    for (const s of US_STATES) {
      await prisma.usPlace.upsert({ where: { geoid: s.fips }, update: {}, create: { geoid: s.fips, kind: 'STATE', name: s.name, stateCode: s.code } });
    }

    // ROI assistant knowledge base (global; derived from the catalog + policies so it never drifts from the DB copy)
    const src = (await prisma.knowledgeSource.findFirst({ where: { workspaceId: null, name: 'ROI public knowledge' } })) ??
      (await prisma.knowledgeSource.create({ data: { name: 'ROI public knowledge', kind: 'SYSTEM', audience: 'CUSTOMER' } }));
    const { createHash } = await import('node:crypto');
    for (const doc of ROI_KNOWLEDGE()) {
      const checksum = createHash('sha256').update(doc.content).digest('hex');
      const exists = await prisma.knowledgeDocument.findUnique({ where: { sourceId_checksum: { sourceId: src.id, checksum } } });
      if (exists) continue;
      const d = await prisma.knowledgeDocument.create({ data: { sourceId: src.id, title: doc.title, url: doc.url, content: doc.content, checksum } });
      const paras = doc.content.split(/\n\n+/);
      for (const [i, para] of paras.entries()) {
        await prisma.knowledgeChunk.create({ data: { documentId: d.id, audience: 'CUSTOMER', ordinal: i, heading: doc.title, content: para, embedding: [] } });
      }
      inc('knowledgeDocs');
    }

    // First admin
    const adminExists = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    if (!adminExists && email) {
      const passwordHash = process.env.SEED_ADMIN_PASSWORD_HASH_B64 ? Buffer.from(process.env.SEED_ADMIN_PASSWORD_HASH_B64, 'base64').toString('utf8') : process.env.SEED_ADMIN_PASSWORD_HASH || (process.env.SEED_ADMIN_PASSWORD ? await hashPassword(process.env.SEED_ADMIN_PASSWORD) : '');
      if (!passwordHash.startsWith('$argon2id$')) throw new Error('SEED_ADMIN_PASSWORD_HASH must be an argon2id hash (or set SEED_ADMIN_PASSWORD)');
      const admin = await prisma.user.create({ data: { email, name: 'ROI Admin', passwordHash, role: 'ADMIN', emailVerifiedAt: new Date(), mustChangePassword: true } });
      await prisma.auditLog.create({ data: { actorId: null, actorRole: 'SYSTEM', action: 'admin.seeded', targetType: 'User', targetId: admin.id, data: { email } } });
      log(`SEED: created first ADMIN ${email} (must change password + enroll 2FA at first sign-in)`);
    }
    log(`SEED: OK ${JSON.stringify(counts)} token-check=${randomToken(4).length > 0}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed().catch((e) => {
    console.error('SEED: FAILED', (e as Error).message);
    process.exit(1);
  });
}
