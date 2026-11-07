'use client';
import { createContext, startTransition, useContext, type FormEvent } from 'react';

/** Pending flag for forms submitted through `submitWithoutReset` (useFormStatus only sees native form actions). */
export const FormPendingContext = createContext(false);
export const useFormPending = () => useContext(FormPendingContext);

/**
 * React 19 resets uncontrolled fields after a form action, which wipes what the user typed when the server answers
 * with a validation error. Submitting through a transition keeps the fields; without JavaScript the native
 * `action` still works (progressive enhancement).
 */
export function submitWithoutReset(dispatch: (f: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(data));
  };
}
