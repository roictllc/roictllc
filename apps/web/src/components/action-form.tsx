'use client';
import { useActionState, type ReactNode } from 'react';
import { FormPendingContext, submitWithoutReset } from './form-pending';

export type ActionState = { error?: string; ok?: string; fieldErrors?: Record<string, string>; data?: Record<string, unknown> } | null;

/** Progressive-enhancement form bound to a Server Action, with accessible error/success regions. */
export function ActionForm({ action, children, className, render }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; children: ReactNode; className?: string; render?: (s: ActionState) => ReactNode }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className={className ?? 'space-y-5'} noValidate>
      <FormPendingContext.Provider value={pending}>
      {state?.error && (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[rgb(255_77_94/0.5)] bg-[rgb(255_77_94/0.1)] px-4 py-3 text-sm">{state.error}</div>
      )}
      {state?.ok && (
        <div role="status" className="rounded-[var(--radius-md)] border border-[rgb(0_245_160/0.45)] bg-[rgb(0_245_160/0.08)] px-4 py-3 text-sm">{state.ok}</div>
      )}
      {children}
      {render?.(state)}
      </FormPendingContext.Provider>
    </form>
  );
}
