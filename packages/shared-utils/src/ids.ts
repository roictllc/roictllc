import { randomBytes } from 'node:crypto';

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

/** Human-friendly order numbers: ROI-YYMMDD-XXXXX (Crockford base32, no ambiguous chars). */
export function orderNumber(d = new Date()): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(5);
  const suffix = Array.from(bytes, (b) => alphabet[b & 31]).join('');
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '');
  return `ROI-${ymd}-${suffix}`;
}

export function generatePassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^*-_=+';
  const out: string[] = [];
  while (out.length < length) {
    const b = randomBytes(1)[0];
    if (b < Math.floor(256 / alphabet.length) * alphabet.length) out.push(alphabet[b % alphabet.length]);
  }
  return out.join('');
}
