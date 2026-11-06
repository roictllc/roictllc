/**
 * Applies packages/database/prisma/migrations/* exactly like `prisma migrate deploy`:
 * same `_prisma_migrations` bookkeeping table, sha256 checksums, one transaction per migration,
 * additive only (refuses migrations containing DROP/TRUNCATE unless ROI_ALLOW_DESTRUCTIVE=1).
 * Used where Prisma's native engine cannot be downloaded (sandboxes, some CI runners).
 * In production the deploy workflow prefers `prisma migrate deploy`; both are interchangeable.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const DESTRUCTIVE = /(^|;)\s*(DROP\s+(TABLE|SCHEMA|DATABASE|TYPE|INDEX)\b|TRUNCATE\s|DELETE\s+FROM\s|ALTER\s+TABLE\s+\S+\s+(DROP|ALTER\s+COLUMN\s+\S+\s+TYPE)\s)/im;
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

export async function applyMigrations(url: string, dir = path.join(import.meta.dirname, '..', 'prisma', 'migrations')) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
    const done = new Map<string, string>(
      (await client.query(`SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows.map(
        (r) => [r.migration_name, r.checksum],
      ),
    );
    const names = readdirSync(dir).filter((n) => existsSync(path.join(dir, n, 'migration.sql'))).sort();
    for (const name of names) {
      const sql = readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (done.has(name)) {
        if (done.get(name) !== checksum) throw new Error(`Migration ${name} was modified after it was applied (checksum mismatch).`);
        continue;
      }
      if (DESTRUCTIVE.test(stripComments(sql)) && process.env.ROI_ALLOW_DESTRUCTIVE !== '1') {
        throw new Error(`Migration ${name} contains a destructive statement; refusing (spec §0.3 / §5.2).`);
      }
      const id = randomUUID();
      await client.query('BEGIN');
      try {
        await client.query(`INSERT INTO "_prisma_migrations"(id, checksum, migration_name, started_at) VALUES ($1,$2,$3, now())`, [id, checksum, name]);
        await client.query(sql);
        await client.query(`UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`, [id]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${name} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('MIGRATE: FAILED (DATABASE_URL_UNPOOLED/DATABASE_URL not set)');
    process.exit(1);
  }
  applyMigrations(url).then(
    (a) => console.log(`MIGRATE: OK (${a.length} applied${a.length ? ': ' + a.join(', ') : ''})`),
    (e) => {
      console.error(`MIGRATE: FAILED (${(e as Error).message.replace(/postgres(ql)?:\/\/[^\s]+/g, '<redacted-url>')})`);
      process.exit(1);
    },
  );
}
