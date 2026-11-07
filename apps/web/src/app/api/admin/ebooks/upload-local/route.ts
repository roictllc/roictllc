import { localStorage } from '@roi/product-engine/storage';
import { getSession } from '@/server/session';
import { can } from '@/server/authz';

/** Development only: stands in for the R2 presigned PUT when files are stored on the local disk. */
export async function PUT(req: Request) {
  if (process.env.APP_ENV === 'production' || !process.env.LOCAL_STORAGE_DIR) return new Response('Not found', { status: 404 });
  const s = await getSession();
  if (!s || !(await can(s.user, 'ebooks.manage'))) return new Response('Forbidden', { status: 403 });
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!/^ebooks\/source\/[0-9a-f-]{36}\.pdf$/.test(key)) return new Response('Bad key', { status: 400 });
  const body = Buffer.from(await req.arrayBuffer());
  await localStorage(process.env.LOCAL_STORAGE_DIR).put('private', key, body, 'application/pdf');
  return new Response(null, { status: 200 });
}
