import path from 'node:path';
import { defineConfig } from 'prisma/config';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(import.meta.dirname, 'prisma', 'migrations'),
    seed: 'tsx packages/database/seed/seed.ts',
  },
  datasource: url ? { url } : undefined,
});
