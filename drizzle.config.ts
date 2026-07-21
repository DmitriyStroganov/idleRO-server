import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'idlero',
    password: process.env.DB_PASSWORD ?? 'idlero',
    database: process.env.DB_NAME ?? 'idlero',
  },
  verbose: true,
  strict: true,
});
