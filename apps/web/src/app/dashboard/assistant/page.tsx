import { AssistantChat } from '@/components/assistant-chat';
import { PageHeader } from '@/components/ui';
import { csrfToken } from '@/server/csrf';
import { requireCustomer } from '@/server/customer';

export const metadata = { title: 'ROI assistant' };

export default async function AssistantPage() {
  await requireCustomer();
  return (
    <>
      <PageHeader title="ROI assistant" intro="Ask about your orders, files, subscriptions, website or any ROI product. It only sees your own account, and it never changes anything without your confirmation." />
      <div className="max-w-3xl"><AssistantChat csrf={await csrfToken()} inline /></div>
    </>
  );
}
