import { ask } from '@roi/assistant';
import { z } from 'zod';
import { db } from '@/server/db';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { getSession } from '@/server/session';
import { customerWorkspaceId } from '@/server/authz';
import { rateLimit } from '@/server/rate-limit';
import { requestMeta } from '@/server/request';

const body = z.object({ message: z.string().trim().min(1).max(500), conversationId: z.string().max(40).nullable().optional() });

export async function POST(req: Request) {
  try {
    await assertCsrf(req.headers.get('x-csrf-token'));
  } catch (e) {
    if (e instanceof CsrfError) return Response.json({ error: 'Your session expired. Refresh the page and try again.' }, { status: 403 });
    throw e;
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Please type a question (up to 500 characters).' }, { status: 400 });
  const s = await getSession();
  const meta = await requestMeta();
  const rl = await rateLimit(`assistant:${s?.user.id ?? meta.ip ?? 'anon'}`, 40, 600);
  if (!rl.ok) return Response.json({ error: `You are sending messages quickly. Try again in ${rl.retryAfterS} s.` }, { status: 429 });

  const workspaceId = s && s.user.role === 'CUSTOMER' ? await customerWorkspaceId(s.user.id) : null;
  const result = await ask(db(), parsed.data.message, { userId: s?.user.id, role: s?.user.role, workspaceId, audience: s && s.user.role !== 'CUSTOMER' ? 'STAFF' : 'CUSTOMER' });

  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const c = await db().assistantConversation.findUnique({ where: { id: conversationId } });
    if (!c || (c.userId ?? null) !== (s?.user.id ?? null)) conversationId = null; // never append to someone else's conversation
  }
  if (!conversationId) {
    conversationId = (await db().assistantConversation.create({ data: { userId: s?.user.id ?? null, workspaceId, channel: 'WEB', title: parsed.data.message.slice(0, 80) } })).id;
  }
  await db().assistantMessage.createMany({
    data: [
      { conversationId, role: 'user', content: parsed.data.message },
      { conversationId, role: 'assistant', content: result.answer, intent: result.intent, citations: result.citations },
    ],
  });
  if (result.toolCalls.length) {
    await db().assistantToolCall.createMany({ data: result.toolCalls.map((t) => ({ conversationId: conversationId!, tool: t.tool, input: t.input, output: JSON.parse(JSON.stringify(t.output)), allowed: t.allowed, durationMs: t.durationMs })) });
  }
  return Response.json({ answer: result.answer, citations: result.citations, conversationId });
}
