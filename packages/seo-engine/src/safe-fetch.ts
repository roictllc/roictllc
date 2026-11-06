import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, fetch as ufetch } from 'undici';

/**
 * SSRF-safe fetch (spec §6) for every server-side URL fetch (SEO crawler, AI audit, link checks, image fetch):
 * - http/https only, ports 80/443 (+ explicit allow-list), no credentials in URL
 * - every DNS answer is validated AT CONNECT TIME (defeats DNS rebinding) against private, loopback,
 *   link-local, CGNAT, multicast, reserved and cloud-metadata ranges (IPv4 + IPv6, incl. v4-mapped)
 * - redirects followed manually (max 5), each hop re-validated
 * - response size cap and total timeout; identifies as ROIBot
 */
export const USER_AGENT = 'ROIBot/1.0 (+https://roictllc.com/bot)';

export class SsrfError extends Error {
  constructor(public reason: string) {
    super(`Blocked URL: ${reason}`);
  }
}

function ipv4ToInt(ip: string) {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
];

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (s === '::' || s === '::1') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) {
      const [hi, lo] = s.replace('::ffff:', '').split(':').map((x) => parseInt(x, 16));
      return isBlockedIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (/^(fc|fd)/.test(s)) return true; // unique local
    if (/^fe[89ab]/.test(s)) return true; // link-local
    if (/^ff/.test(s)) return true; // multicast
    if (/^2001:db8/.test(s)) return true; // documentation
    if (/^64:ff9b::/.test(s)) return true; // NAT64 (could reach v4 private)
    if (/^fd00:ec2::254/.test(s)) return true; // AWS metadata v6
    return false;
  }
  return true;
}

const allowLoopbackForTests = () => process.env.APP_ENV === 'test' && process.env.ROI_SSRF_ALLOW_LOOPBACK_FOR_TESTS === '1';

function validatingLookup(hostname: string, options: object, cb: (err: Error | null, address?: string | Array<{ address: string; family: number }>, family?: number) => void) {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = addresses as Array<{ address: string; family: number }>;
    const bad = list.find((a) => isBlockedIp(a.address) && !(allowLoopbackForTests() && (a.address === '127.0.0.1' || a.address === '::1')));
    if (bad || !list.length) return cb(new SsrfError(`resolves to a private or reserved address`));
    if ((options as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

const agent = new Agent({ connect: { lookup: validatingLookup as never, timeout: 8000 }, headersTimeout: 10_000, bodyTimeout: 10_000 });

export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError('invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SsrfError('only http and https are allowed');
  if (u.username || u.password) throw new SsrfError('credentials in URL are not allowed');
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (![80, 443].includes(port) && !allowLoopbackForTests()) throw new SsrfError('port not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedIp(host) && !(allowLoopbackForTests() && (host === '127.0.0.1' || host === '::1'))) throw new SsrfError('private or reserved address');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host) && !allowLoopbackForTests()) throw new SsrfError('internal hostname');
  return u;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  redirects: string[];
  timeMs: number;
}

export async function safeFetch(raw: string, opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; accept?: string } = {}): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const started = Date.now();
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  const redirects: string[] = [];
  let current = assertSafeUrl(raw);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    const res = await ufetch(current, {
      dispatcher: agent, redirect: 'manual', signal: deadline,
      headers: { 'User-Agent': USER_AGENT, Accept: opts.accept ?? 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location')!, current);
      redirects.push(next.toString());
      current = assertSafeUrl(next.toString());
      await res.body?.cancel();
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return { url: current.toString(), status: res.status, headers, body: Buffer.concat(chunks).toString('utf8'), bytes: total, redirects, timeMs: Date.now() - started };
  }
  throw new SsrfError('too many redirects');
}

/** robots.txt evaluation for a given user-agent token (longest-match allow/disallow). */
export function robotsAllows(robotsTxt: string, agentToken: string, path: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of robotsTxt.split(/\r?\n/)) {
    const clean = line.replace(/#.*/, '').trim();
    const m = clean.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      if (val || key === 'allow') cur.rules.push({ allow: key === 'allow', path: val });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const token = agentToken.toLowerCase();
  const group = groups.find((g) => g.agents.some((a) => a !== '*' && token.includes(a))) ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (!r.path) continue;
    const pattern = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (pattern.test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}
