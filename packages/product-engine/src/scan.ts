import net from 'node:net';

/**
 * Upload malware scanning (spec §6 uploads, Product 1 step 1).
 * - When CLAMAV_HOST is set (the Docker Compose `clamav` service on the VPS), every upload is streamed to clamd with
 *   the INSTREAM protocol and must come back `OK`. A scanner that is configured but unreachable FAILS CLOSED.
 * - Without ClamAV (development, or the serverless preview), a built-in screen runs instead: EICAR test signature,
 *   embedded script/HTML/PHP/PE markers and ZIP polyglots. The engine used is recorded on the asset.
 * Images are always re-encoded afterwards, which drops any trailing payload.
 */
export interface ScanResult {
  clean: boolean;
  engine: 'clamav' | 'builtin';
  signature?: string;
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const MARKERS: Array<[string, RegExp]> = [
  ['Embedded.Script', /<script[\s>]/i],
  ['Embedded.PHP', /<\?php/i],
  ['Embedded.HTML', /<html[\s>]|<iframe[\s>]|javascript:/i],
  ['Embedded.SVGScript', /<svg[^>]*onload\s*=/i],
];

export function builtinScan(buf: Buffer): ScanResult {
  if (buf.includes(EICAR)) return { clean: false, engine: 'builtin', signature: 'Eicar-Test-Signature' };
  // PE executable header anywhere after the first bytes (polyglot) or at the start.
  if (buf.subarray(0, 2).toString('latin1') === 'MZ') return { clean: false, engine: 'builtin', signature: 'Executable.PE' };
  // ZIP archive appended to an image (polyglot): needs both a local header and an end-of-central-directory record,
  // so random compressed image bytes do not trigger it.
  const zipAt = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (zipAt > 0 && buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) > zipAt) return { clean: false, engine: 'builtin', signature: 'Polyglot.ZIP' };
  const text = buf.toString('latin1');
  for (const [sig, re] of MARKERS) if (re.test(text)) return { clean: false, engine: 'builtin', signature: sig };
  return { clean: true, engine: 'builtin' };
}

export function clamdScan(buf: Buffer, host: string, port = 3310, timeoutMs = 30_000): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let reply = '';
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('ClamAV scan timed out'));
    }, timeoutMs);
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let off = 0; off < buf.length; off += 64 * 1024) {
        const chunk = buf.subarray(off, off + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on('data', (d) => (reply += d.toString('utf8')));
    sock.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    sock.on('close', () => {
      clearTimeout(timer);
      const r = reply.replace(/\0/g, '').trim();
      if (/:\s*OK$/.test(r)) resolve({ clean: true, engine: 'clamav' });
      else if (/FOUND$/.test(r)) resolve({ clean: false, engine: 'clamav', signature: r.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, '') });
      else reject(new Error(`ClamAV error: ${r || 'no reply'}`));
    });
  });
}

export async function scanUpload(buf: Buffer): Promise<ScanResult> {
  const pre = builtinScan(buf);
  if (!pre.clean) return pre;
  const host = process.env.CLAMAV_HOST;
  if (!host) return pre;
  return clamdScan(buf, host, Number(process.env.CLAMAV_PORT ?? 3310)); // fail closed: errors propagate
}
