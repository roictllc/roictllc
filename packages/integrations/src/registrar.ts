/**
 * RegistrarProvider (spec §14). `search` returns availability, first-year price, renewal price, premium and
 * restricted flags; `register` buys the domain idempotently; `setContacts` makes the customer the registrant;
 * `setRecords` points DNS at the hosting target.
 *
 * Porkbun API v3 (verified 2026-11-06 at porkbun.com/llms-full.txt and /api/json/v3/spec):
 * - POST /domain/checkDomain/{domain} → { avail: "yes"|"no", price, additional.renewal.price, ... }
 * - GET  /domain/getRegistrationRequirements/{tld} → apiRegisterable, create-body schema, eligibility schema (.us …)
 * - POST /domain/create/{domain} { cost (cents), agreeToTerms: "yes", dryRun? } + Idempotency-Key header;
 *   a single API registration is capped at $100; responses are replayed for 24 h for the same key.
 * - POST /domain/updateContacts/{domain}, POST /dns/create/{domain}
 * - Sandbox keys start with pk1_sb_ / sk1_sb_ (same base URL, no real purchases).
 * Rate limits: availability 10 per 10 s; registration attempts 1 per second.
 */
export interface DomainQuote {
  name: string;
  available: boolean;
  firstYearCents: number;
  renewalCents: number;
  premium: boolean;
  restricted: boolean;
  apiRegisterable: boolean;
  raw?: unknown;
}
export interface RegistrantContact {
  firstName: string;
  lastName: string;
  organization?: string;
  email: string;
  phone: string; // E.164-ish, e.g. +1.8135550142
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string; // ISO 3166-1 alpha-2
}
export interface RegistrarProvider {
  name: 'porkbun';
  sandbox: boolean;
  search(domain: string): Promise<DomainQuote>;
  register(domain: string, a: { costCents: number; idempotencyKey: string; dryRun?: boolean }): Promise<{ ok: boolean; wouldSucceed?: boolean; requestId?: string; message?: string }>;
  setContacts(domain: string, c: RegistrantContact): Promise<{ ok: boolean; message?: string }>;
  setRecords(domain: string, records: Array<{ type: 'A' | 'CNAME' | 'ALIAS' | 'TXT'; name: string; content: string; ttl?: number }>): Promise<{ ok: boolean; created: number; message?: string }>;
}

const cents = (v: unknown) => Math.round(Number(v ?? NaN) * 100);
/** TLDs with registry eligibility rules ROI does not collect automatically (manual review). */
const RESTRICTED_TLDS = new Set(['us', 'ca', 'eu', 'uk', 'au', 'de', 'fr', 'it', 'nyc', 'bank', 'insurance', 'gov', 'edu', 'mil']);

export function porkbun(cfg: { apiKey: string; secretKey: string; fetchImpl?: typeof fetch }): RegistrarProvider {
  const f = cfg.fetchImpl ?? fetch;
  const base = 'https://api.porkbun.com/api/json/v3';
  async function post<T>(path: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    const res = await f(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ apikey: cfg.apiKey, secretapikey: cfg.secretKey, ...body }), signal: AbortSignal.timeout(30_000) });
    const j = (await res.json().catch(() => ({}))) as T & { status?: string; message?: string; code?: string };
    return { ok: res.ok && j.status === 'SUCCESS', status: res.status, j };
  }
  return {
    name: 'porkbun',
    sandbox: cfg.apiKey.startsWith('pk1_sb_'),
    async search(domain) {
      const name = domain.toLowerCase();
      const tld = name.slice(name.lastIndexOf('.') + 1);
      const r = await post<{ response?: { avail?: string; price?: string; premium?: string; additional?: { renewal?: { price?: string } } } }>(`/domain/checkDomain/${name}`);
      if (!r.ok) throw new Error(`Porkbun checkDomain: ${r.j.message ?? r.status}`);
      const resp = (r.j as { response?: Record<string, unknown> }).response ?? (r.j as Record<string, unknown>);
      const first = cents(resp.price);
      const renewal = cents((resp.additional as { renewal?: { price?: string } } | undefined)?.renewal?.price ?? resp.price);
      const req = await f(`${base}/domain/getRegistrationRequirements/${tld}`, { headers: { 'X-API-Key': cfg.apiKey, 'X-Secret-API-Key': cfg.secretKey }, signal: AbortSignal.timeout(15_000) }).then((x) => x.json()).catch(() => ({})) as { apiRegisterable?: boolean; eligibilitySchema?: unknown };
      return {
        name, available: resp.avail === 'yes', firstYearCents: first, renewalCents: renewal, premium: resp.premium === 'yes' || resp.premium === true as unknown,
        restricted: RESTRICTED_TLDS.has(tld) || !!req.eligibilitySchema, apiRegisterable: req.apiRegisterable !== false, raw: resp,
      };
    },
    async register(domain, a) {
      if (a.costCents > 10_000) return { ok: false, message: 'Porkbun API registrations are capped at $100; register this one manually.' };
      const r = await post<{ wouldSucceed?: boolean; requestId?: string }>(`/domain/create/${domain.toLowerCase()}`, { cost: a.costCents, agreeToTerms: 'yes', ...(a.dryRun ? { dryRun: true } : {}) }, { 'Idempotency-Key': a.idempotencyKey });
      return { ok: r.ok && (!a.dryRun || r.j.wouldSucceed !== false), wouldSucceed: r.j.wouldSucceed, requestId: r.j.requestId, message: r.j.message };
    },
    async setContacts(domain, c) {
      const contact = { firstName: c.firstName, lastName: c.lastName, organization: c.organization ?? '', email: c.email, phone: c.phone, address1: c.address1, city: c.city, state: c.state, zip: c.zip, country: c.country };
      const r = await post(`/domain/updateContacts/${domain.toLowerCase()}`, { registrant: contact, admin: contact, tech: contact, billing: contact });
      return { ok: r.ok, message: r.j.message };
    },
    async setRecords(domain, records) {
      let created = 0;
      for (const rec of records) {
        const r = await post(`/dns/create/${domain.toLowerCase()}`, { type: rec.type, name: rec.name, content: rec.content, ttl: String(rec.ttl ?? 600) });
        if (!r.ok) return { ok: false, created, message: r.j.message };
        created++;
      }
      return { ok: true, created };
    },
  };
}

export function registrarFromEnv(env: NodeJS.ProcessEnv = process.env): RegistrarProvider | null {
  if ((env.REGISTRAR_PROVIDER ?? 'porkbun') === 'porkbun' && env.REGISTRAR_API_KEY && env.REGISTRAR_API_SECRET) return porkbun({ apiKey: env.REGISTRAR_API_KEY, secretKey: env.REGISTRAR_API_SECRET });
  return null;
}
