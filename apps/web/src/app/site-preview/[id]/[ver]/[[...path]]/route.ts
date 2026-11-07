import { storageFromEnv } from '@roi/product-engine/storage';
import { loadBundle, resolveSitePath } from '@roi/product-engine/websites';
import { contentType } from '@roi/site-generator/hosting';
import { getSession } from '@/server/session';
import { accessibleWorkspaceIds } from '@/server/authz';
import { db } from '@/server/db';

/**
 * Owner/staff preview of any saved website version (spec Product 5 "version history with preview"). Root-relative
 * links are rewritten under this path so the whole site can be browsed; never indexed, never cached.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; ver: string; path?: string[] }> }) {
  const { id, ver, path = [] } = await params;
  const s = await getSession();
  if (!s) return new Response('Sign in to preview', { status: 401 });
  const site = await db().website.findUnique({ where: { id }, include: { deployments: { where: { status: 'LIVE' }, take: 1, include: { version: true } } } });
  const ws = await accessibleWorkspaceIds(s.user);
  if (!site || (ws !== null && !ws.includes(site.workspaceId))) return new Response('Not found', { status: 404 });
  const version = ver === 'live' ? site.deployments[0]?.version : await db().websiteVersion.findFirst({ where: { websiteId: id, version: Number(ver) || -1 } });
  if (!version) return new Response('Version not found', { status: 404 });
  const storage = storageFromEnv();
  if (!storage) return new Response('Storage awaiting configuration', { status: 503 });
  const bundle = await loadBundle(storage, version.bundleKey);
  const r = resolveSitePath(bundle.files, `/${path.join('/')}${path.length && !path.at(-1)!.includes('.') ? '/' : ''}`);
  if (!r.file) return new Response('Not found', { status: 404 });
  let body = bundle.files[r.file];
  if (r.file.endsWith('.html')) body = body.replace(/(href|src|action)="\/(?!\/)/g, `$1="/site-preview/${id}/${ver}/`);
  return new Response(body, { status: r.status, headers: { 'Content-Type': contentType(r.file), 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
}
