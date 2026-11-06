import { hash, verify } from '@node-rs/argon2';

/** Argon2id (spec §6). Parameters: OWASP 2024 recommendation m=19 MiB, t=2, p=1. */
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    return false;
  }
}

/** A tiny built-in list of the most common breached passwords; the optional HIBP k-anonymity check runs in the web app. */
const COMMON = new Set([
  'password1234', '123456789012', 'qwertyuiop12', 'iloveyou1234', 'administrator', 'welcome12345', 'letmein12345',
  'passwordpassword', '111111111111', '000000000000', 'abc123456789', 'football1234', 'baseball1234', 'changeme1234',
]);

export function passwordProblems(pw: string, email?: string): string[] {
  const out: string[] = [];
  if (pw.length < MIN_PASSWORD_LENGTH) out.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (pw.length > 256) out.push('Use at most 256 characters.');
  if (COMMON.has(pw.toLowerCase())) out.push('This password is too common.');
  if (email && pw.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) out.push('Do not include your email name in the password.');
  if (/^(.)\1+$/.test(pw)) out.push('Do not repeat a single character.');
  return out;
}
