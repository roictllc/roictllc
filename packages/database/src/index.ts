import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';
export type { Prisma } from './generated/client';

declare global {
  // eslint-disable-next-line no-var
  var __roiPrisma: PrismaClient | undefined;
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

export function createPrisma(url = databaseUrl()): PrismaClient {
  const adapter = new PrismaPg({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter });
}

/** Process-wide client (server only). */
export function db(): PrismaClient {
  if (!globalThis.__roiPrisma) globalThis.__roiPrisma = createPrisma();
  return globalThis.__roiPrisma;
}

/**
 * Tenant scope (spec §5.3): models that carry workspaceId can only be read/written inside the
 * given workspace. Every customer-facing repository uses `scoped(workspaceId)`.
 */
export const TENANT_MODELS = new Set([
  'Customer', 'BusinessProfile', 'CustomerProject', 'CustomerAsset', 'Order', 'Subscription', 'Invoice',
  'GeneratedDeliverable', 'Website', 'Domain', 'SocialAccount', 'SocialPost', 'BrandKit', 'SupportTicket',
  'ClientAiConnection', 'LogoConcept', 'EBookPurchase', 'SignatureSet', 'SeoAudit', 'ContentCalendarItem',
  'KeywordSuggestion', 'NapCheck', 'AiTrackedQuestion', 'SocialSubscription', 'LogoUpload', 'DomainQuote',
]);

const READ_OPS = new Set(['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany']);
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);

export function scoped(workspaceId: string, client: PrismaClient = db()) {
  if (!workspaceId) throw new Error('scoped() requires a workspaceId');
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, unknown>;
          if (READ_OPS.has(operation)) {
            a.where = { AND: [(a.where as object) ?? {}, { workspaceId }] };
          } else if (UNIQUE_OPS.has(operation)) {
            const delegate = (client as unknown as Record<string, { findUnique: (x: unknown) => Promise<{ workspaceId: string } | null> }>)[
              model.charAt(0).toLowerCase() + model.slice(1)
            ];
            const owner = await delegate.findUnique({ where: a.where, select: { workspaceId: true } });
            if (owner && owner.workspaceId !== workspaceId) {
              if (operation.startsWith('findUnique')) {
                if (operation === 'findUniqueOrThrow') throw new Error('NOT_FOUND');
                return null; // behave as "not found": no cross-tenant existence leak
              }
              throw new Error('TENANT_VIOLATION');
            }
            if (operation === 'upsert') a.create = { ...(a.create as object), workspaceId };
            return query(a);
          } else if (operation === 'create') {
            a.data = { ...(a.data as object), workspaceId };
          } else if (operation === 'createMany') {
            const d = a.data as object | object[];
            a.data = Array.isArray(d) ? d.map((x) => ({ ...x, workspaceId })) : { ...d, workspaceId };
          }
          return query(a);
        },
      },
    },
  });
}
