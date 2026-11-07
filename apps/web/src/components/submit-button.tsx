'use client';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { Button } from './ui';
import { useFormPending } from './form-pending';

export function SubmitButton({ children, pendingText = 'Working…', variant = 'primary', size = 'md', className }: { children: ReactNode; pendingText?: string; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const status = useFormStatus();
  const ctxPending = useFormPending();
  const pending = status.pending || ctxPending;
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}
