import { componentHealth } from '@/server/health';

export const dynamic = 'force-dynamic';

/** GET /api/health — DB, queue depth, worker heartbeat, integrations (spec §5.2). 503 when core is down. */
export async function GET() {
  const h = await componentHealth();
  return Response.json(h, { status: h.overall === 'operational' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
