import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';
import { setFlagAction } from '@/server/actions/admin';

export const metadata = { title: 'Feature flags' };

export default async function FlagsPage() {
  const { user } = await requireUser({ roles: ['ADMIN'] });
  await assertCan(user, 'flags.manage');
  const flags = await db().featureFlag.findMany({ orderBy: { key: 'asc' } });
  return (
    <>
      <PageHeader title="Feature flags" intro="HIDDEN, COMING SOON or LIVE. Flags that depend on an integration (such as checkout) refuse LIVE until that integration passes its live check." />
      <Table head={['Flag', 'Description', 'State', 'Change']}
        rows={flags.map((f) => [
          <code key="k" className="font-mono text-xs text-[var(--color-primary)]">{f.key}</code>,
          <span key="d" className="text-sm text-[var(--color-muted)]">{f.description}</span>,
          <Pill key="s" tone={statusTone(f.visibility)}>{f.visibility.replace('_', ' ')}</Pill>,
          <ActionForm key="c" action={setFlagAction} className="flex items-center gap-2">
            <CsrfField /><input type="hidden" name="key" value={f.key} />
            <select name="visibility" defaultValue={f.visibility} aria-label={`State for ${f.key}`} className="rounded-lg border border-[var(--color-border)] bg-black/30 px-2 py-1 text-xs">
              <option>HIDDEN</option><option>COMING_SOON</option><option>LIVE</option>
            </select>
            <button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs">Apply</button>
          </ActionForm>,
        ])} />
    </>
  );
}
