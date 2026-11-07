'use client';
import { useActionState, useMemo, useState } from 'react';
import { computeMargin, type CostModel } from '@roi/shared-utils/margin';
import type { ActionState } from './action-form';
import { submitWithoutReset } from './form-pending';

/** Live margin-guard preview while the admin types a price (spec §8.1, §9.3). */
export function PriceEditor({ planId, planName, currentCents, interval, model, csrf, action }: {
  planId: string; planName: string; currentCents: number | null; interval: 'ONE_TIME' | 'MONTH' | 'YEAR'; model: CostModel; csrf: string;
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [amount, setAmount] = useState(currentCents !== null ? (currentCents / 100).toFixed(2) : '');
  const cents = Math.round(Number(amount) * 100);
  const m = useMemo(() => (Number.isFinite(cents) && cents > 0 ? computeMargin(cents, model) : null), [cents, model]);
  return (
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="roi-glass space-y-4 rounded-[var(--radius-lg)] p-5">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="planId" value={planId} />
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">{planName}</h3>
        {currentCents !== null && <span className="font-mono text-sm text-[var(--color-muted)]">current ${(currentCents / 100).toFixed(2)}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <label className="space-y-1 text-sm">Price (USD)
          <input name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 font-mono" />
        </label>
        <label className="space-y-1 text-sm">Billing
          <select name="interval" defaultValue={interval} className="w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2">
            <option value="ONE_TIME">One-time</option><option value="MONTH">Monthly</option><option value="YEAR">Yearly</option>
          </select>
        </label>
      </div>
      {m && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${m.belowMinimum ? 'border-[rgb(255_77_94/0.5)] bg-[rgb(255_77_94/0.08)]' : 'border-[rgb(0_245_160/0.4)] bg-[rgb(0_245_160/0.06)]'}`} aria-live="polite">
          <p className="font-semibold">Contribution margin {(m.marginBps / 100).toFixed(1)}% {m.belowMinimum ? `— below the ${(m.minMarginBps / 100).toFixed(0)}% minimum` : '✓'}</p>
          <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
            Stripe fee ${(m.paymentFeeCents / 100).toFixed(2)} · other costs ${(m.variableCostCents / 100).toFixed(2)} · contribution ${(m.contributionCents / 100).toFixed(2)}
          </p>
        </div>
      )}
      <label className="block space-y-1 text-sm">Reason for the change
        <input name="reason" required minLength={3} placeholder="e.g. Launch pricing" className="w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2" />
      </label>
      {m?.belowMinimum && (
        <label className="block space-y-1 text-sm">Override reason (required below minimum, recorded in the audit log)
          <input name="overrideReason" minLength={10} className="w-full rounded-xl border border-[rgb(255_77_94/0.5)] bg-black/30 px-3 py-2" />
        </label>
      )}
      {state?.error && <p role="alert" className="text-sm text-[var(--color-danger)]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-[var(--color-success)]">{state.ok}</p>}
      <button disabled={pending} className="roi-gradient rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save new price version'}</button>
    </form>
  );
}
