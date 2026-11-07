import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Card, PageHeader, Textarea } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';
import { updateSettingAction } from '@/server/actions/admin';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { user } = await requireUser({ roles: ['ADMIN'] });
  await assertCan(user, 'settings.manage');
  const settings = await db().setting.findMany({ where: { NOT: { key: { startsWith: 'alert-state:' } } }, orderBy: { key: 'asc' } }); // monitoring state is internal
  return (
    <>
      <PageHeader title="Settings" intro="Thresholds, policies and company facts. Values are JSON; every change is audited. The domain rule, grace period and margin minimum take effect immediately." />
      <div className="grid gap-4 lg:grid-cols-2">
        {settings.map((s) => (
          <Card key={s.key}>
            <h2 className="font-mono text-sm font-semibold text-[var(--color-primary)]">{s.key}</h2>
            {s.description && <p className="mt-1 text-sm text-[var(--color-muted)]">{s.description}</p>}
            <ActionForm action={updateSettingAction} className="mt-3 space-y-3">
              <CsrfField />
              <input type="hidden" name="key" value={s.key} />
              <Textarea name="value" aria-label={`Value for ${s.key}`} defaultValue={JSON.stringify(s.value, null, 2)} className="min-h-24 font-mono text-xs" />
              <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
