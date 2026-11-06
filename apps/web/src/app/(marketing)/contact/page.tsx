import type { Metadata } from 'next';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Card, Container, Field, Input, Select, SectionHeading, Textarea } from '@/components/ui';
import { Turnstile } from '@/components/turnstile';
import { contactAction } from '@/server/actions/public';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Contact ROI', description: 'Talk to ROI about AI visibility, social media autopilot, websites, SEO or your account. We reply within one business day.', path: '/contact' });

export default function ContactPage() {
  return (
    <Container className="grid gap-10 py-16 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <SectionHeading eyebrow="Contact" title="Talk to a person" intro="Questions about a product, your account or a partnership? We usually reply within one business day." />
        <Card className="mt-8"><p className="text-sm text-[var(--color-muted)]">Email</p><a className="mt-1 block font-semibold text-[var(--color-primary)]" href="mailto:roictllc@gmail.com">roictllc@gmail.com</a><p className="mt-4 text-sm text-[var(--color-muted)]">Customers can also open a ticket from the dashboard for the fastest answer.</p></Card>
      </div>
      <Card glow>
        <ActionForm action={contactAction} className="space-y-4">
          <CsrfField />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name"><Input name="name" required /></Field>
            <Field label="Email" name="email"><Input name="email" type="email" required /></Field>
          </div>
          <Field label="Company (optional)" name="company"><Input name="company" /></Field>
          <Field label="Topic" name="topic"><Select name="topic" defaultValue="sales"><option value="sales">Sales</option><option value="support">Support</option><option value="billing">Billing</option><option value="partnership">Partnership</option><option value="press">Press</option><option value="other">Other</option></Select></Field>
          <Field label="Message" name="message"><Textarea name="message" required minLength={10} /></Field>
          <Turnstile />
          <SubmitButton>Send message</SubmitButton>
        </ActionForm>
      </Card>
    </Container>
  );
}
