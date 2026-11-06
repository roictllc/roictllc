'use client';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { Button } from './ui';

export function SubmitButton({ children, pendingText = 'Working…', variant = 'primary', size = 'md', className }: { children: ReactNode; pendingText?: string; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}
