import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('portal includes all 46 provisioned usernames and PWA installation files', async () => {
  const page = await readFile(new URL('../management/index.html', import.meta.url), 'utf8');
  const roster = page.slice(page.indexOf('const translators=['), page.indexOf('].map(([username'));
  const users = [...roster.matchAll(/\['([^']+)'/g)].map((m) => m[1]);
  assert.equal(users.length, 46);
  assert.equal(new Set(users).size, 46);
  assert.match(page, /manifest\.webmanifest/);
  assert.match(page, /serviceWorker/);
});

test('portal keeps production passwords out of source', async () => {
  const page = await readFile(new URL('../management/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /Tr@|M24\d\d/);
});
