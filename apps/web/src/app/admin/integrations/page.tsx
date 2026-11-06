import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Card, PageHeader, Pill, statusTone } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';
import { refreshIntegrationsAction } from '@/server/actions/admin';

export const metadata = { title: 'Integrations' };

export default async function IntegrationsPage() {
  const { user } = await requireUser({ roles: ['ADMIN'] });
  await assertCan(user, 'integrations.manage');
  const list = await db().integration.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] });
  const connected = list.filter((i) => i.status === 'CONNECTED').length;
  return (
    <>
      <PageHeader
        title="Integrations"
        intro={`${connected} of ${list.length} connected. This is the owner checklist: each line shows the exact environment variable names to set, and flips to “connected” only after a live health check passes.`}
        actions={<ActionForm action={refreshIntegrationsAction} className="flex items-center gap-3"><CsrfField /><SubmitButton size="sm" pendingText="Checking…">Run live checks</SubmitButton></ActionForm>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((i) => (
          <Card key={i.id} className={i.status === 'CONNECTED' ? 'border-[rgb(0_245_160/0.35)]' : ''}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{i.name}</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">Unlocks: {i.unlocks.join(' · ')}</p>
              </div>
              <Pill tone={statusTone(i.status)}>{i.status.replace(/_/g, ' ').toLowerCase()}</Pill>
            </div>
            <p className="mt-4 text-sm"><span className="font-semibold">Owner step: </span>{i.ownerStep}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {i.requiredEnv.map((v) => (
                <code key={v} className={`rounded-md px-2 py-0.5 font-mono text-xs ${i.missingEnv.includes(v) ? 'bg-[rgb(255_196_0/0.12)] text-[var(--color-warning)]' : 'bg-[rgb(0_245_160/0.1)] text-[var(--color-success)]'}`}>{v}{i.missingEnv.includes(v) ? ' · missing' : ' ✓'}</code>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted)]">{i.lastCheckAt ? `Last checked ${i.lastCheckAt.toISOString().slice(0, 16).replace('T', ' ')} UTC${i.lastError ? ` · ${i.lastError}` : ''}` : 'Not checked yet — press “Run live checks”.'}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
