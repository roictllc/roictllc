import pg from 'pg';
import { getSession } from '@/server/session';
import { customerWorkspaceId } from '@/server/authz';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Server-Sent Events from Postgres LISTEN/NOTIFY (spec §2.1). Only events belonging to the caller's workspace are
 * forwarded. On serverless hosts (no long-lived connections) it tells the client to fall back to polling.
 */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response('Unauthorized', { status: 401 });
  const encoder = new TextEncoder();
  const serverless = !!process.env.VERCEL;
  const workspaceId = s.user.role === 'CUSTOMER' ? await customerWorkspaceId(s.user.id) : null;

  if (serverless) {
    return new Response(encoder.encode('event: fallback\ndata: {}\n\n'), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
  await client.connect();
  await client.query('LISTEN roi_events');
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: object) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('ready', {});
      client.on('notification', async (n) => {
        try {
          const p = JSON.parse(n.payload ?? '{}') as { table: string; id: string };
          if (workspaceId) {
            const owner = p.table === 'social_post_metric_snapshots'
              ? (await db().socialPostMetricSnapshot.findUnique({ where: { id: p.id }, select: { post: { select: { workspaceId: true } } } }))?.post.workspaceId
              : p.table === 'social_posts' ? (await db().socialPost.findUnique({ where: { id: p.id }, select: { workspaceId: true } }))?.workspaceId
              : (await db().automationJob.findUnique({ where: { id: p.id }, select: { workspaceId: true } }))?.workspaceId;
            if (owner !== workspaceId) return;
          }
          send('change', { table: p.table });
        } catch {
          /* ignore malformed */
        }
      });
      const ping = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 25_000);
      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        client.end().catch(() => {});
        try {
          controller.close();
        } catch {
          /* closed */
        }
      });
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' } });
}
