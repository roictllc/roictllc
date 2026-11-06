import { csrfToken } from '@/server/csrf';
import { getFlag } from '@/server/catalog';
import { AssistantChat } from './assistant-chat';

export async function AssistantWidget() {
  if ((await getFlag('assistant.public').catch(() => 'HIDDEN')) !== 'LIVE') return null;
  return <AssistantChat csrf={await csrfToken()} />;
}
