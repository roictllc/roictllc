/** `npm run db:check` (spec §5.2): SELECT 1 against the real database; never prints credentials. */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('DB_CHECK: FAILED (DATABASE_URL is not set)');
  process.exit(1);
}
const started = performance.now();
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  await client.query('SELECT 1');
  const v = (await client.query('SHOW server_version')).rows[0].server_version as string;
  const tables = (await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n as number;
  console.log(`DB_CHECK: OK (latency ${Math.round(performance.now() - started)} ms, PostgreSQL ${v}, ${tables} tables)`);
  await client.end();
} catch (e) {
  const msg = (e as Error).message.replace(/postgres(ql)?:\/\/\S+/g, '<redacted>').replace(/password[^\s]*/gi, 'password=<redacted>');
  console.log(`DB_CHECK: FAILED (${msg})`);
  process.exit(1);
}
