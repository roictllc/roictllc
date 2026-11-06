import 'server-only';
import { presignUrl, r2FromEnv } from '@roi/integrations/r2';

export const storageConfigured = () => !!r2FromEnv() && !!process.env.R2_BUCKET_PRIVATE;

export async function presignGet(bucket: string, key: string, expiresS: number, downloadName?: string) {
  const cfg = r2FromEnv();
  if (!cfg) throw new Error('R2 not configured');
  return presignUrl(cfg, 'GET', bucket, key, expiresS, new Date(), downloadName ? { 'response-content-disposition': `attachment; filename="${downloadName.replace(/"/g, '')}"` } : {});
}
