import type { Metadata } from 'next';
import { ServicePage } from '@/components/service-page';
import { Card, Container, Field, Input, Select, Textarea } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { contactAction } from '@/server/actions/public';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'AI for business — your own assistant trained on your business', description: 'A website assistant trained only on your content, built into ROI with no external AI fees, plus automations with your own ChatGPT, Claude or Gemini key.', path: '/ai-for-business' });

export default function AiForBusinessPage() {
  return (
    <ServicePage path="/ai-for-business" eyebrow="AI integration · Product 10" plainTitle="AI for business"
      title={<>Your own AI assistant, <span className="roi-gradient-text">trained on your business</span>.</>}
      answer="ROI’s AI Business Growth Integration gives your business a website assistant trained only on your own content — services, prices, hours and policies — built into ROI with no external AI fees. It captures leads and hands off to a person. Optionally, connect your own ChatGPT, Claude or Gemini account and key for reply drafts, review responses and weekly digests, with spending limits you set."
      cta={{ href: '#quote', label: 'Request a quote' }}
      steps={[['Tell us your goals', 'What should the assistant handle? Which tools do you use?'], ['We scope & quote', 'A fixed setup quote plus a monthly management fee, agreed first.'], ['Train on your content', 'FAQs, services, policies — isolated to your business only.'], ['Test & go live', 'Test conversations, your approval, then a one-line install on your site.']]}
      productSlugs={['ai-business-integration', 'ai-visibility']}
      faq={[
        { q: 'Who pays for ChatGPT or Claude usage?', a: 'If you connect your own provider, you pay that provider directly under your account and limits. ROI never marks up or pays for those calls. The built-in assistant needs no external AI at all.' },
        { q: 'Is my data used to train other businesses’ assistants?', a: 'No. Each business’s knowledge is isolated and only answers that business’s visitors.' },
      ]}
      extra={
        <Container className="py-8" >
          <Card className="mx-auto max-w-2xl" glow>
            <h2 id="quote" className="scroll-mt-28 font-display text-2xl font-semibold">Request a quote</h2>
            <ActionForm action={contactAction} className="mt-5 space-y-4">
              <CsrfField />
              <input type="hidden" name="topic" value="sales" />
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name" name="name"><Input name="name" required /></Field>
                <Field label="Email" name="email"><Input name="email" type="email" required /></Field>
              </div>
              <Field label="Business" name="company"><Input name="company" /></Field>
              <Field label="What should the assistant do?" name="message"><Textarea name="message" required minLength={10} placeholder="Answer pricing questions, book consultations, qualify leads…" /></Field>
              <SubmitButton>Send request</SubmitButton>
            </ActionForm>
          </Card>
        </Container>
      } />
  );
}
