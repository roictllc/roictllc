import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { EbookUploader } from '@/components/ebook-uploader';
import { SubmitButton } from '@/components/submit-button';
import { Card, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';
import { csrfToken } from '@/server/csrf';
import { db } from '@/server/db';
import { createEbookAction } from '@/server/actions/ebooks';

export const metadata = { title: 'Add e-book' };

export default async function NewEbookPage() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  await assertCan(user, 'ebooks.manage');
  const [cats, csrf] = await Promise.all([db().eBookCategory.findMany({ orderBy: { name: 'asc' } }), csrfToken()]);
  return (
    <>
      <PageHeader title="Add an e-book" intro="Upload the PDF, fill in the details and confirm your rights. ROI validates and scans the file, suggests where Chapter 1 starts and renders the 3-page preview as images." />
      <Card>
        <ActionForm action={createEbookAction}>
          <CsrfField />
          <EbookUploader csrf={csrf} />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Title" name="title"><Input id="title" name="title" required maxLength={160} /></Field>
            <Field label="Subtitle (optional)" name="subtitle"><Input id="subtitle" name="subtitle" maxLength={200} /></Field>
            <Field label="Author" name="author"><Input id="author" name="author" required maxLength={120} /></Field>
            <Field label="Category" name="categoryId"><Select id="categoryId" name="categoryId" required>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Price (USD)" name="price" hint="Checked by the margin guard; below the minimum margin you must give a reason."><Input id="price" name="price" required inputMode="decimal" placeholder="9.99" /></Field>
            <Field label="Margin override reason (only if asked)" name="overrideReason"><Input id="overrideReason" name="overrideReason" maxLength={300} /></Field>
            <Field label="Language" name="language"><Input id="language" name="language" defaultValue="en" maxLength={10} /></Field>
            <Field label="Tags (comma separated)" name="tags"><Input id="tags" name="tags" maxLength={300} /></Field>
            <Field label="Chapter 1 starts on page" name="chapter1StartPage" hint="Leave empty to auto-detect; you can change it after processing."><Input id="chapter1StartPage" name="chapter1StartPage" inputMode="numeric" placeholder="auto" /></Field>
            <Field label="Preview pages" name="previewPageCount"><Input id="previewPageCount" name="previewPageCount" type="number" min={1} max={10} defaultValue={3} /></Field>
          </div>
          <Field label="Description" name="description"><Textarea id="description" name="description" rows={5} required minLength={40} maxLength={4000} /></Field>
          <label className="flex gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 text-sm"><input type="checkbox" name="attest" required className="mt-1" /><span><strong>Rights attestation:</strong> I own or hold a license to sell this book. (Recorded with your account, time and IP.)</span></label>
          <SubmitButton pendingText="Saving…">Save draft and process</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
