import { getSession } from '@/server/session';
import { customerWorkspaceId } from '@/server/authz';
import { db } from '@/server/db';
import { stripeApi } from '@/server/stripe';
import { appUrl } from '@/server/env';
import { assertCsrf } from '@/server/csrf';

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return Response.redirect(`${appUrl()}/login`, 303);
  const form = await req.formData().catch(() => null);
  try {
    await assertCsrf(form?.get('csrf') ?? null);
  } catch {
    return new Response('Session expired — refresh the page and try again.', { status: 403 });
  }
  const ws = await customerWorkspaceId(s.user.id);
  const w = ws ? await db().businessWorkspace.findUnique({ where: { id: ws } }) : null;
  if (!w?.stripeCustomerId || !process.env.STRIPE_SECRET_KEY) return Response.redirect(`${appUrl()}/dashboard/billing`, 303);
  const portal = await stripeApi<{ url: string }>('billing_portal/sessions', { customer: w.stripeCustomerId, return_url: `${appUrl()}/dashboard/billing` });
  return Response.redirect(portal.url, 303);
}
