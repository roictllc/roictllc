import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUsd } from '@roi/shared-utils';
import { bookPlanSlug } from '@roi/product-engine/ebook-plan';
import { ActionForm } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { CsrfField } from '@/components/csrf-field';
import { PriceEditor } from '@/components/price-editor';
import { SubmitButton } from '@/components/submit-button';
import { Alert, Card, Field, Input, PageHeader, Pill, Select, statusTone, Table, Textarea } from '@/components/ui';
import { requireUser } from '@/server/session';
import { assertCan, can } from '@/server/authz';
import { csrfToken } from '@/server/csrf';
import { db } from '@/server/db';
import { costModelFor } from '@/server/pricing';
import { ebookPageUrl } from '@/server/ebooks';
import { setEbookStatusAction, updateEbookAction } from '@/server/actions/ebooks';
import { changePriceAction } from '@/server/actions/admin';

export const metadata = { title: 'E-book' };

export default async function EbookEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ price?: string }> }) {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  await assertCan(user, 'ebooks.manage');
  const { id } = await params;
  const sp = await searchParams;
  const book = await db().eBook.findUnique({ where: { id }, include: { category: true, previewPages: { orderBy: { pageNumber: 'asc' } }, attestations: { orderBy: { createdAt: 'desc' }, take: 1 }, purchases: { orderBy: { createdAt: 'desc' }, take: 20, include: { downloads: true } } } });
  if (!book) notFound();
  const [cats, jobs, plan, csrf, canSource, canPrice] = await Promise.all([
    db().eBookCategory.findMany({ orderBy: { name: 'asc' } }),
    db().automationJob.findMany({ where: { type: 'ebook.ingest', payload: { path: ['ebookId'], equals: id } }, orderBy: { createdAt: 'desc' }, take: 1, include: { steps: { orderBy: { startedAt: 'asc' } } } }),
    db().productPlan.findFirst({ where: { slug: bookPlanSlug(id) }, include: { prices: { orderBy: { version: 'desc' } } } }),
    csrfToken(), can(user, 'ebooks.source'), can(user, 'prices.manage'),
  ]);
  const job = jobs[0];
  const processing = !!job && ['PENDING', 'PROCESSING'].includes(job.status);
  const current = plan?.prices.find((p) => !p.activeTo) ?? null;
  const users = await db().user.findMany({ where: { id: { in: book.purchases.map((p) => p.userId) } }, select: { id: true, email: true } });
  return (
    <>
      <PageHeader title={book.title} intro={`${book.author} · ${book.category.name} · ${book.pageCount ?? '?'} pages`} actions={<span className="flex items-center gap-3"><Pill tone={statusTone(book.status)}>{book.archivedAt ? 'ARCHIVED' : book.status}</Pill>{book.status === 'LIVE' && <Link href={`/ebooks/${book.slug}`} className="text-sm text-[var(--color-primary)]">View in catalog →</Link>}</span>} />
      <AutoRefresh active={processing} />
      {sp.price === 'blocked' && <div className="mb-6"><Alert tone="warning" title="Price not accepted">The margin guard blocked the initial price. Set a price below (with a reason if you go under the minimum margin).</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <h2 className="font-display text-lg font-semibold">Processing</h2>
          {!job ? <p className="mt-2 text-sm text-[var(--color-muted)]">No processing job yet.</p> : (
            <div className="mt-3 space-y-2 text-sm">
              <p><Pill tone={statusTone(job.status)}>{job.status}</Pill> {job.lastError && <span className="text-[var(--color-danger)]">{job.lastError}</span>}</p>
              <p className="flex flex-wrap gap-2">{job.steps.map((s) => <Pill key={s.id} tone={statusTone(s.status)}>{s.name}{s.durationMs ? ` · ${(s.durationMs / 1000).toFixed(1)} s` : ''}</Pill>)}</p>
              {book.status === 'REJECTED' && <Alert tone="danger" title="File rejected">Upload a clean, unencrypted PDF without scripts or embedded files.</Alert>}
            </div>
          )}
          <h3 className="mt-6 font-display font-semibold">Preview pages (what customers see)</h3>
          {book.previewPages.length === 0 ? <p className="mt-2 text-sm text-[var(--color-muted)]">{processing ? 'Rendering…' : 'None yet.'}</p> : (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {book.previewPages.map((p) => <figure key={p.id}><img src={ebookPageUrl(p.id)} alt={`Preview page ${p.pageNumber}`} className="w-full rounded-lg border border-[var(--color-border)] bg-white" /><figcaption className="mt-1 text-center text-xs text-[var(--color-muted)]">Page {p.pageNumber}</figcaption></figure>)}
            </div>
          )}
          <p className="mt-4 text-xs text-[var(--color-muted)]">Previews render only for published books outside this editor; staff see them here while drafting.</p>
          {canSource && <p className="mt-4"><a href={`/api/admin/ebooks/${book.id}/source`} className="text-sm text-[var(--color-primary)] underline">Download the source PDF (audited)</a></p>}
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-lg font-semibold">Publish</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Price: {current ? formatUsd(current.amountCents) : 'not set'} · Rights: {book.attestations[0] ? `attested ${book.attestations[0].createdAt.toISOString().slice(0, 10)}` : 'missing'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['LIVE', 'DRAFT', 'ARCHIVED'] as const).map((st) => (
                <ActionForm key={st} action={setEbookStatusAction} className="inline">
                  <CsrfField /><input type="hidden" name="id" value={book.id} /><input type="hidden" name="status" value={st} />
                  <SubmitButton size="sm" variant={st === 'LIVE' ? 'primary' : 'secondary'}>{st === 'LIVE' ? 'Publish' : st === 'DRAFT' ? 'Unpublish' : 'Archive'}</SubmitButton>
                </ActionForm>
              ))}
            </div>
          </Card>
          {plan && canPrice && <PriceEditor planId={plan.id} planName="Book price" currentCents={current?.amountCents ?? null} interval="ONE_TIME" model={await costModelFor(plan.productId)} csrf={csrf} action={changePriceAction} />}
        </div>
      </div>
      <Card className="mt-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Details</h2>
        {/* keyed by processing results so detected values (Chapter 1, pages) show up after the job finishes */}
        <ActionForm key={`${book.chapter1StartPage}-${book.pageCount}-${book.previewPageCount}`} action={updateEbookAction}>
          <CsrfField /><input type="hidden" name="id" value={book.id} />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Title" name="title"><Input id="title" name="title" defaultValue={book.title} required /></Field>
            <Field label="Subtitle" name="subtitle"><Input id="subtitle" name="subtitle" defaultValue={book.subtitle ?? ''} /></Field>
            <Field label="Author" name="author"><Input id="author" name="author" defaultValue={book.author} required /></Field>
            <Field label="Category" name="categoryId"><Select id="categoryId" name="categoryId" defaultValue={book.categoryId}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Chapter 1 starts on page" name="chapter1StartPage" hint={book.pageCount ? `1–${book.pageCount}. Changing it re-renders the preview.` : undefined}><Input id="chapter1StartPage" name="chapter1StartPage" type="number" min={1} max={book.pageCount ?? undefined} defaultValue={book.chapter1StartPage} /></Field>
            <Field label="Preview pages" name="previewPageCount"><Input id="previewPageCount" name="previewPageCount" type="number" min={1} max={10} defaultValue={book.previewPageCount} /></Field>
            <Field label="Language" name="language"><Input id="language" name="language" defaultValue={book.language} /></Field>
            <Field label="Tags" name="tags"><Input id="tags" name="tags" defaultValue={book.tags.join(', ')} /></Field>
          </div>
          <Field label="Description" name="description"><Textarea id="description" name="description" rows={5} defaultValue={book.description} /></Field>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </ActionForm>
      </Card>
      <Card className="mt-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Buyers</h2>
        <Table head={['Buyer', 'Bought', 'Downloads', 'Last download']} empty="No sales yet."
          rows={book.purchases.map((p) => [users.find((u) => u.id === p.userId)?.email ?? p.userId, p.createdAt.toISOString().slice(0, 10), `${p.downloadCount}/${p.downloadLimit}`, p.downloads.at(-1)?.createdAt.toISOString().slice(0, 16).replace('T', ' ') ?? '—'])} />
      </Card>
    </>
  );
}
