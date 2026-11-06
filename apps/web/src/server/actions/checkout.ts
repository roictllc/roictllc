'use server';
import { redirect } from 'next/navigation';
import type { ActionState } from '@/components/action-form';
import { assertCsrf, CsrfError } from '../csrf';
import { requireCustomer } from '../customer';
import { rateLimit } from '../rate-limit';
import { CheckoutError, createCheckout } from '../commerce';
import { getSetting } from '../catalog';
import { audit } from '../audit';

export async function checkoutAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertCsrf(form.get('csrf'));
  } catch (e) {
    if (e instanceof CsrfError) return { error: 'Your session expired. Refresh and try again.' };
    throw e;
  }
  const c = await requireCustomer();
  if (form.get('consent') !== 'on') return { error: 'Please accept the delivery consent, Terms and Refund Policy.' };
  const rl = await rateLimit(`checkout:${c.user.id}`, 20, 3600);
  if (!rl.ok) return { error: 'Too many checkout attempts. Please wait a moment.' };
  let url: string;
  try {
    const consentText = await getSetting<string>('checkout.consentText', 'I agree that delivery begins immediately and accept the Terms and Refund Policy.');
    const r = await createCheckout({ userId: c.user.id, workspaceId: c.workspaceId, planId: String(form.get('planId')), consentText });
    await audit('checkout.started', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Order', targetId: r.order.id });
    url = r.url;
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    return { error: 'We could not start checkout. Please try again in a minute.' };
  }
  redirect(url);
}
