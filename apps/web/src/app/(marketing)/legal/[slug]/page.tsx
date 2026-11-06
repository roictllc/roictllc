import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Alert, Card, Container, Field, Input, Select, Textarea } from '@/components/ui';
import { db } from '@/server/db';
import { takedownAction } from '@/server/actions/public';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await db().legalDocument.findUnique({ where: { slug: (await params).slug } });
  return d ? pageMeta({ title: d.title, description: `${d.title} for ROI LLC (roictllc.com).`, path: `/legal/${d.slug}` }) : { title: 'Not found' };
}

function render(body: string) {
  return body.split(/\n\n+/).map((block, i) => {
    if (block.startsWith('## ')) return <h2 key={i} className="mt-10 font-display text-2xl font-semibold">{block.slice(3)}</h2>;
    if (block.split('\n').every((l) => l.startsWith('- '))) return <ul key={i} className="mt-4 list-disc space-y-2 pl-6 text-[var(--color-muted)]">{block.split('\n').map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
    return <p key={i} className="mt-4 leading-relaxed text-[var(--color-muted)]">{block}</p>;
  });
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await db().legalDocument.findUnique({ where: { slug: (await params).slug } });
  if (!d) notFound();
  return (
    <Container className="max-w-3xl py-16">
      <h1 className="font-display text-4xl font-bold">{d.title}</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Version {d.version} · updated {d.updatedAt.toISOString().slice(0, 10)}</p>
      <div className="mt-6"><Alert tone="info">{d.reviewNote}</Alert></div>
      <div className="mt-6">{render(d.body)}</div>
      {d.slug === 'takedown' && (
        <Card className="mt-12">
          <h2 className="font-display text-2xl font-semibold">Submit a notice or counter-notice</h2>
          <ActionForm action={takedownAction} className="mt-5 space-y-4">
            <CsrfField />
            <Field label="Type" name="kind"><Select name="kind"><option value="DMCA_NOTICE">DMCA takedown notice</option><option value="COUNTER_NOTICE">Counter-notice</option></Select></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Full name" name="claimantName"><Input name="claimantName" required /></Field><Field label="Email" name="claimantEmail"><Input name="claimantEmail" type="email" required /></Field></div>
            <Field label="Postal address" name="claimantAddress"><Input name="claimantAddress" required /></Field>
            <Field label="URL of the material" name="url"><Input name="url" type="url" required /></Field>
            <Field label="Describe the copyrighted work" name="workDescription"><Textarea name="workDescription" required /></Field>
            <label className="flex gap-3 text-sm"><input type="checkbox" name="goodFaith" required className="mt-1 size-4" />I have a good-faith belief that the use is not authorized by the owner, its agent or the law (or, for counter-notices, that the material was removed by mistake).</label>
            <label className="flex gap-3 text-sm"><input type="checkbox" name="accuracy" required className="mt-1 size-4" />Under penalty of perjury, the information is accurate and I am authorized to act.</label>
            <Field label="Electronic signature (type your full name)" name="signature"><Input name="signature" required /></Field>
            <SubmitButton>Submit</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </Container>
  );
}
