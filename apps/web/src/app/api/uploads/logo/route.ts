import { IntakeRejected, ingestLogoUpload } from '@roi/product-engine/intake';
import { storageFromEnv } from '@roi/product-engine/storage';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { getSession } from '@/server/session';
import { customerWorkspaceId } from '@/server/authz';
import { db } from '@/server/db';
import { rateLimit } from '@/server/rate-limit';
import { requestMeta } from '@/server/request';
import { audit } from '@/server/audit';
import { isCreateSlug, previewAvailability, signatureAvailability } from '@/server/previews';

export const runtime = 'nodejs';
const MAX = 10 * 1024 * 1024;

/**
 * Logo upload for Products 1–2 (spec §6 uploads): verified customer, CSRF, rate limit, 10 MB cap enforced before
 * the body is read, malware scan, magic bytes, pixel cap, re-encode to PNG. Returns the asset id used by the form.
 */
export async function POST(req: Request) {
  try {
    await assertCsrf(req.headers.get('x-csrf-token'));
  } catch (e) {
    if (e instanceof CsrfError) return Response.json({ error: 'Your session expired. Refresh the page and try again.' }, { status: 403 });
    throw e;
  }
  const s = await getSession();
  if (!s || s.user.role !== 'CUSTOMER') return Response.json({ error: 'Please sign in.' }, { status: 401 });
  if (!s.user.emailVerifiedAt) return Response.json({ error: 'Please verify your email first — free previews need a verified account.' }, { status: 403 });
  const workspaceId = await customerWorkspaceId(s.user.id);
  if (!workspaceId) return Response.json({ error: 'No workspace.' }, { status: 403 });
  const product = new URL(req.url).searchParams.get('product') ?? '';
  const forSignature = product === 'email-signature-suite';
  if (!forSignature && (!isCreateSlug(product) || product === 'logo-generator')) return Response.json({ error: 'Unknown product.' }, { status: 400 });
  const avail = forSignature ? await signatureAvailability() : await previewAvailability(product as 'animated-gif-logo' | 'logo-revival');
  if (!avail.ok) return Response.json({ error: avail.reason }, { status: 409 });
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX + 64 * 1024) return Response.json({ error: 'File is larger than 10 MB.' }, { status: 413 });
  const meta = await requestMeta();
  for (const [key, limit] of [[`upload:${s.user.id}`, 30], [`upload-ip:${meta.ip ?? 'unknown'}`, 60]] as const) {
    const rl = await rateLimit(key, limit, 3600);
    if (!rl.ok) return Response.json({ error: `Too many uploads. Try again in ${Math.ceil(rl.retryAfterS / 60)} min.` }, { status: 429 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Choose a PNG or JPG file.' }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: 'File is larger than 10 MB.' }, { status: 413 });
  const storage = storageFromEnv();
  if (!storage) return Response.json({ error: 'File storage is awaiting configuration.' }, { status: 503 });
  try {
    const r = await ingestLogoUpload(db(), storage, { workspaceId, buf: Buffer.from(await file.arrayBuffer()), originalName: file.name, purpose: product as 'animated-gif-logo' | 'logo-revival' | 'email-signature-suite', minSide: product === 'animated-gif-logo' ? 300 : 64 });
    await audit('upload.accepted', { actorId: s.user.id, actorRole: 'CUSTOMER', targetType: 'CustomerAsset', targetId: r.asset.id, data: { product, scanEngine: r.scanEngine, bytes: file.size } });
    return Response.json({ assetId: r.asset.id, width: r.asset.width, height: r.asset.height, name: file.name });
  } catch (e) {
    if (e instanceof IntakeRejected) {
      await audit('upload.rejected', { actorId: s.user.id, actorRole: 'CUSTOMER', targetType: 'Workspace', targetId: workspaceId, data: { product, reason: e.message } });
      return Response.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
}
