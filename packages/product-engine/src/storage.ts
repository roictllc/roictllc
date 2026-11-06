import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { putObject, r2FromEnv } from '../../integrations/src/r2';

/** StorageProvider (spec §2.3): Cloudflare R2 in staging/production; a local directory only in development/test. */
export interface StorageProvider {
  name: string;
  put(bucket: 'private' | 'public', key: string, body: Buffer, contentType: string): Promise<{ key: string; size: number; sha256: string; publicUrl?: string }>;
  get(bucket: 'private' | 'public', key: string): Promise<Buffer>;
}

export function r2Storage(): StorageProvider | null {
  const cfg = r2FromEnv();
  if (!cfg || !process.env.R2_BUCKET_PRIVATE || !process.env.R2_BUCKET_PUBLIC) return null;
  return {
    name: 'r2',
    async put(bucket, key, body, contentType) {
      const b = bucket === 'private' ? process.env.R2_BUCKET_PRIVATE! : process.env.R2_BUCKET_PUBLIC!;
      const r = await putObject(cfg, b, key, body, contentType);
      return { ...r, publicUrl: bucket === 'public' ? `${process.env.R2_PUBLIC_BASE_URL}/${key}` : undefined };
    },
    async get(bucket, key) {
      const { presignUrl } = await import('../../integrations/src/r2');
      const b = bucket === 'private' ? process.env.R2_BUCKET_PRIVATE! : process.env.R2_BUCKET_PUBLIC!;
      const res = await fetch(presignUrl(cfg, 'GET', b, key, 120));
      if (!res.ok) throw new Error(`R2 GET ${key}: HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

export function localStorage(root: string): StorageProvider {
  if (process.env.APP_ENV === 'production') throw new Error('Local storage is not allowed in production');
  return {
    name: 'local',
    async put(bucket, key, body) {
      const f = path.join(root, bucket, key);
      await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, body);
      return { key, size: body.length, sha256: createHash('sha256').update(body).digest('hex'), publicUrl: bucket === 'public' ? `file://${f}` : undefined };
    },
    async get(bucket, key) {
      return readFile(path.join(root, bucket, key));
    },
  };
}

export function storageFromEnv(): StorageProvider | null {
  return r2Storage() ?? (process.env.APP_ENV !== 'production' && process.env.LOCAL_STORAGE_DIR ? localStorage(process.env.LOCAL_STORAGE_DIR) : null);
}
