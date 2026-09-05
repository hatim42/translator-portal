import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("forms portal source keeps its public identity and only the August payroll form", async () => {
  const [rootHtml, formsHtml] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("forms/index.html", root), "utf8"),
  ]);

  for (const html of [rootHtml, formsHtml]) {
    assert.match(html, /<title>\s*بوابة المترجم\s*<\/title>/i);
    assert.doesNotMatch(html, /<title>\s*منصة المترجمين\s*<\/title>/i);

    const formLinks = [...html.matchAll(/https:\/\/forms\.gle\/[A-Za-z0-9]+/g)].map((match) => match[0]);
    assert.equal(new Set(formLinks).size, 5);

    assert.match(html, /href="https:\/\/forms\.gle\/noHPKwv2E1169Zss5"[^>]*>[\s\S]*?<span class="month-number">08<\/span>[\s\S]*?<strong>أغسطس 2026<\/strong>/);
    assert.equal((html.match(/<a class="month(?: current)?"/g) || []).length, 1);
    assert.doesNotMatch(html, /<strong>(?:يوليو|يونيو|مايو) 2026<\/strong>/);
    assert.doesNotMatch(html, /<span class="month-number">(?:07|06|05)<\/span>/);
  }

  await access(new URL("assets/religious-affairs-logo.jpg", root));
});

test("forms repository contains no management application entry points", async () => {
  for (const path of ["app/page.tsx", "db/portal.ts", "wrangler.jsonc", "management/index.html"]) {
    await assert.rejects(access(new URL(path, root)));
  }
});
