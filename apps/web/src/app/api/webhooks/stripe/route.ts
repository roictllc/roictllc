import { handleStripeEvent } from '@/server/commerce';
import { verifyStripeSignature } from '@/server/stripe';

export const runtime = 'nodejs';

/** Stripe webhooks (spec §9.2): signature verified on the RAW body; events stored once; 2xx only after processing. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Stripe webhooks awaiting configuration', { status: 503 });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret)) return new Response('Invalid signature', { status: 400 });
  let evt: { id: string; type: string; created: number; data: { object: Record<string, unknown> } };
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  try {
    const r = await handleStripeEvent(evt);
    return Response.json({ received: true, result: r });
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'stripe_webhook_failed', eventId: evt.id, type: evt.type, error: (e as Error).message }));
    return new Response('Processing failed', { status: 500 }); // Stripe retries
  }
}
