import 'server-only';
import { db } from './db';
import { requestMeta } from './request';

/** Append-only audit trail for every sensitive action (spec §6). */
export async function audit(
  action: string,
  opts: { actorId?: string | null; actorRole?: string | null; targetType?: string; targetId?: string; data?: Record<string, unknown> } = {},
) {
  let meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null };
  try {
    meta = await requestMeta();
  } catch {
    /* outside a request */
  }
  await db().auditLog.create({
    data: {
      action, actorId: opts.actorId ?? null, actorRole: opts.actorRole ?? null, targetType: opts.targetType, targetId: opts.targetId,
      ip: meta.ip, userAgent: meta.userAgent, data: (opts.data ?? undefined) as object | undefined,
    },
  });
}
