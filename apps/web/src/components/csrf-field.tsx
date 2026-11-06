import { csrfToken } from '@/server/csrf';

/** Hidden double-submit CSRF token for every state-changing form (spec §6). */
export async function CsrfField() {
  return <input type="hidden" name="csrf" value={await csrfToken()} />;
}
