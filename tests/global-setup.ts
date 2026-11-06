/**
 * Integration tests run against a real PostgreSQL database (spec §21).
 * TEST_DATABASE_URL defaults to the local roi_test database. The schema is rebuilt from the migrations
 * on every run (this database is disposable and never the production database).
 */
import pg from 'pg';
import { applyMigrations } from '../packages/database/scripts/apply-migrations';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://roi:roi_local_dev@localhost:5432/roi_test';
  if (/neon\.tech|roictllc\.com/.test(url)) throw new Error('Refusing to run destructive test setup against a non-test database');
  process.env.DATABASE_URL = url;
  process.env.APP_ENV = 'test';
  process.env.INTEGRATION_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');
  process.env.SESSION_SECRET ??= 'test-session-secret-'.padEnd(64, 'x');
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await c.end();
  await applyMigrations(url);
  const { seed } = await import('../packages/database/seed/seed');
  process.env.SEED_ADMIN_EMAIL = 'admin@test.example';
  process.env.SEED_ADMIN_PASSWORD = 'Test-Admin-Password-123';
  await seed({ log: () => {} });
}
