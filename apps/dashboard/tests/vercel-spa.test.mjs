import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('dashboard vercel.json rewrites unknown paths to index.html so /login loads', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(readFileSync(join(dir, '../vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});
