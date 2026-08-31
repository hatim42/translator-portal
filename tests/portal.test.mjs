import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("portal provisions exactly 46 unique translator accounts", async () => {
  const seed = await readFile(new URL("../db/seed-data.ts", import.meta.url), "utf8");
  const usernames = [...seed.matchAll(/username: "([a-z0-9]+)"/g)].map((match) => match[1]);
  assert.equal(usernames.length, 46);
  assert.equal(new Set(usernames).size, 46);
  assert.match(seed, /languageGroup:/);
  assert.match(seed, /group: "أساسي"/);
  assert.match(seed, /group: "مساند"/);
});

test("production source contains no static passwords or invitation codes", async () => {
  const files = await Promise.all([
    readFile(new URL("../app/portal-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/portal.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/seed-data.ts", import.meta.url), "utf8"),
  ]);
  const source = files.join("\n");
  assert.doesNotMatch(source, /e2e-owner|e2e-shakeel|password\s*[:=]\s*["'][^"']+|Tr@|M24\d\d/i);
  assert.match(source, /crypto\.getRandomValues/);
  assert.match(source, /SHA-256/);
});

test("portal has durable workflows and installable PWA assets", async () => {
  const [schema, route, manifest, worker] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/portal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  for (const table of ["translators", "preferences", "requests", "attendance", "daily_stats", "audit_log"]) {
    assert.match(schema, new RegExp(table));
  }
  for (const action of ["save-preference", "create-request", "decide-request", "save-distribution", "attendance", "daily-stat"]) {
    assert.match(route, new RegExp(action));
  }
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(worker, /translator-portal-v2/);
  assert.doesNotMatch(worker, /\/api\/.+cache/i);
});
