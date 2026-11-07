import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * HostingProvider (spec Product 5 publishing pipeline, §14).
 * - `cloudflare-pages`: one Pages project per site, Direct Upload through the API (no per-customer Git repo).
 * - `roi-host`: ROI's multi-tenant host — the live bundle is served by the ROI server for the site's domain, TLS by
 *   Caddy on-demand certificates (asks /api/sites/tls-allowed). Used automatically when Cloudflare is not configured
 *   or the account is near its Pages project limit.
 * Cloudflare limits recorded 2026-11-06 from developers.cloudflare.com/pages/platform/limits: 100 projects per account
 * (not routinely increased), 20,000 files per site (Free), 25 MiB per file, custom domains per project 100/250/500.
 */
export interface DeployResult {
  provider: string;
  providerDeploymentId: string | null;
  url: string;
  log: string[];
}
export interface HostingProvider {
  name: 'cloudflare-pages' | 'roi-host';
  deploy(site: { websiteId: string; projectName: string }, files: Record<string, string>): Promise<DeployResult>;
  attachDomain(site: { projectName: string }, domain: string): Promise<{ ok: boolean; detail: string; dnsTarget: string }>;
}

export const CF_LIMITS = { projectsPerAccount: 100, filesPerSite: 20_000, maxFileBytes: 25 * 1024 * 1024, recordedAt: '2026-11-06', source: 'https://developers.cloudflare.com/pages/platform/limits/' } as const;

const ext = (p: string) => (p.includes('.') ? p.slice(p.lastIndexOf('.') + 1) : '');
const CT: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', xml: 'application/xml', txt: 'text/plain; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', js: 'text/javascript' };
export const contentType = (path: string) => CT[ext(path)] ?? 'application/octet-stream';

/** Pages asset key: BLAKE3 of (base64 of the contents + extension without the dot), first 32 hex chars (as wrangler does). */
export function pagesAssetHash(content: Buffer, path: string) {
  return bytesToHex(blake3(new TextEncoder().encode(content.toString('base64') + ext(path)))).slice(0, 32);
}

/** Project names: lowercase, digits and dashes, ≤ 58 chars, unique per site. */
export const pagesProjectName = (websiteId: string, businessName: string) => `roi-${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'site'}-${websiteId.slice(-8).toLowerCase()}`;

type Fetch = typeof fetch;

export function cloudflarePages(cfg: { accountId: string; apiToken: string; fetchImpl?: Fetch }): HostingProvider {
  const f = cfg.fetchImpl ?? fetch;
  const api = 'https://api.cloudflare.com/client/v4';
  async function call<T>(path: string, init: RequestInit & { jwt?: string } = {}): Promise<T> {
    const res = await f(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${init.jwt ?? cfg.apiToken}`, ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: Array<{ code: number; message: string }> };
    if (!res.ok || j.success === false) throw new Error(`Cloudflare ${path.replace(/accounts\/[^/]+/, 'accounts/…')}: ${j.errors?.map((e) => `${e.code} ${e.message}`).join('; ') || res.status}`);
    return j.result as T;
  }
  async function ensureProject(name: string, log: string[]) {
    try {
      await call(`/accounts/${cfg.accountId}/pages/projects/${name}`);
      log.push(`project ${name} exists`);
    } catch {
      await call(`/accounts/${cfg.accountId}/pages/projects`, { method: 'POST', body: JSON.stringify({ name, production_branch: 'main' }) });
      log.push(`project ${name} created`);
    }
  }
  return {
    name: 'cloudflare-pages',
    async deploy(site, files) {
      const log: string[] = [];
      const entries = Object.entries(files).map(([path, text]) => ({ path, body: Buffer.from(text, 'utf8') }));
      if (entries.length > CF_LIMITS.filesPerSite) throw new Error(`Site has ${entries.length} files; the Pages limit is ${CF_LIMITS.filesPerSite}`);
      if (entries.some((e) => e.body.length > CF_LIMITS.maxFileBytes)) throw new Error('A file exceeds the 25 MiB Pages limit');
      await ensureProject(site.projectName, log);
      const { jwt } = await call<{ jwt: string }>(`/accounts/${cfg.accountId}/pages/projects/${site.projectName}/upload-token`);
      const hashed = entries.map((e) => ({ ...e, hash: pagesAssetHash(e.body, e.path) }));
      const missing = await call<string[]>('/pages/assets/check-missing', { method: 'POST', jwt, body: JSON.stringify({ hashes: hashed.map((h) => h.hash) }) });
      const need = hashed.filter((h) => missing.includes(h.hash));
      for (let i = 0; i < need.length; i += 500) {
        const batch = need.slice(i, i + 500).map((h) => ({ key: h.hash, value: h.body.toString('base64'), metadata: { contentType: contentType(h.path) }, base64: true }));
        await call('/pages/assets/upload', { method: 'POST', jwt, body: JSON.stringify(batch) });
      }
      log.push(`uploaded ${need.length}/${hashed.length} assets`);
      await call('/pages/assets/upsert-hashes', { method: 'POST', jwt, body: JSON.stringify({ hashes: hashed.map((h) => h.hash) }) });
      const form = new FormData();
      form.set('manifest', JSON.stringify(Object.fromEntries(hashed.map((h) => [`/${h.path}`, h.hash]))));
      form.set('branch', 'main');
      const dep = await call<{ id: string; url: string }>(`/accounts/${cfg.accountId}/pages/projects/${site.projectName}/deployments`, { method: 'POST', body: form });
      log.push(`deployment ${dep.id}`);
      return { provider: 'cloudflare-pages', providerDeploymentId: dep.id, url: `https://${site.projectName}.pages.dev`, log };
    },
    async attachDomain(site, domain) {
      try {
        await call(`/accounts/${cfg.accountId}/pages/projects/${site.projectName}/domains`, { method: 'POST', body: JSON.stringify({ name: domain }) });
        return { ok: true, detail: 'Domain attached; SSL is issued by Cloudflare once DNS points to the project.', dnsTarget: `${site.projectName}.pages.dev` };
      } catch (e) {
        return { ok: false, detail: (e as Error).message, dnsTarget: `${site.projectName}.pages.dev` };
      }
    },
  };
}

/** ROI multi-tenant host: "deploying" records the version as live; the ROI server serves it by Host header. */
export function roiHost(cfg: { appOrigin: string; hostTarget: string }): HostingProvider {
  return {
    name: 'roi-host',
    async deploy(site) {
      return { provider: 'roi-host', providerDeploymentId: null, url: `${cfg.appOrigin}/site-preview/${site.websiteId}/live/`, log: ['served by the ROI host from the stored bundle; public once a verified domain points here'] };
    },
    async attachDomain(_site, domain) {
      return { ok: true, detail: `Point ${domain} to ${cfg.hostTarget} (A/CNAME). SSL is issued automatically on the first visit once DNS resolves.`, dnsTarget: cfg.hostTarget };
    },
  };
}
