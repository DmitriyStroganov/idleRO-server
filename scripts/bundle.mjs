/**
 * esbuild-based bundler for production.
 *
 * Why esbuild instead of plain tsc:
 *   - Resolves path aliases (@engine/*, @data/*, @ai/*) cleanly.
 *   - Bundles everything into a single file → no module-resolution issues
 *     at runtime (no Node ESM directory-import problem).
 *   - 10x faster than tsc + tsc-alias.
 *
 * Output: dist/index.js (single ESM bundle, ~500 KB).
 * External deps (fastify, mysql2, drizzle-orm, ws, …) stay as `import`
 * statements — Node resolves them from node_modules at runtime.
 */

import { build } from 'esbuild';

const opts = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: 'dist/index.js',
  sourcemap: true,
  packages: 'external',
  alias: {
    '@engine': './src/engine',
    '@data': './src/data',
    '@ai': './src/ai',
  },
  logLevel: 'info',
};

await build(opts);
console.log('✓ Bundled to dist/index.js');
