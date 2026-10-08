import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("forms portal keeps September current, archived months, and translator registration", async () => {
  const [rootHtml, formsHtml] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("forms/index.html", root), "utf8"),
  ]);

  for (const html of [rootHtml, formsHtml]) {
    assert.match(html, /<title>\s*بوابة المترجم\s*<\/title>/i);
    assert.doesNotMatch(html, /<title>\s*منصة المترجمين\s*<\/title>/i);

    const formLinks = [...html.matchAll(/https:\/\/forms\.gle\/[A-Za-z0-9]+/g)].map((match) => match[0]);
    assert.equal(new Set(formLinks).size, 9);

    assert.match(html, /<a class="month current" href="https:\/\/forms\.gle\/z3UAzcB4yDLC18Mt9"[^>]*>[\s\S]*?<span class="month-number">09<\/span>[\s\S]*?<strong>سبتمبر 2026<\/strong>/);
    assert.match(html, /href="https:\/\/forms\.gle\/noHPKwv2E1169Zss5"[^>]*>[\s\S]*?<span class="month-number">08<\/span>[\s\S]*?<strong>أغسطس 2026<\/strong>/);
    assert.match(html, /href="https:\/\/forms\.gle\/ruPHNHU48HSAh5aN6"[^>]*>[\s\S]*?<span class="month-number">07<\/span>[\s\S]*?<strong>يوليو 2026<\/strong>/);
    assert.match(html, /href="https:\/\/forms\.gle\/W9uajxE18bZv6XCh6"[^>]*>[\s\S]*?<span class="month-number">06<\/span>[\s\S]*?<strong>يونيو 2026<\/strong>/);
    assert.match(html, /href="https:\/\/forms\.gle\/1kVRUtiZcbbSDaDy9"[^>]*>[\s\S]*?<span class="month-number">05<\/span>[\s\S]*?<strong>مايو 2026<\/strong>/);
    assert.equal((html.match(/<a class="month(?: current)?"/g) || []).length, 5);
    assert.ok(html.indexOf("سبتمبر 2026") < html.indexOf("أغسطس 2026"));
    assert.ok(html.indexOf("أغسطس 2026") < html.indexOf("يوليو 2026"));
    assert.ok(html.indexOf("يوليو 2026") < html.indexOf("يونيو 2026"));
    assert.ok(html.indexOf("يونيو 2026") < html.indexOf("مايو 2026"));

    assert.doesNotMatch(html, /Vpii9nconX4R7Fxe9|تسجيل ورديات|تسجيل الوردية وأيام الراحة/);
    assert.match(html, /href="https:\/\/forms\.gle\/UkavHSdaiA9ffY8o6"[^>]*>[\s\S]*?<strong>تسجيل بيانات المترجمين<\/strong>/);
    assert.match(html, /href="https:\/\/forms\.gle\/sqhKUSsMRxbt5ftn8"[^>]*>[\s\S]*?<strong>تسجيل الملاحظات الإدارية والميدانية<\/strong><span class="hint">لفت نظر · محضر · ملاحظات ميدانية<\/span>/);
  }

  await access(new URL("assets/religious-affairs-logo.jpg", root));
});

test("forms repository contains no management application entry points", async () => {
  for (const path of ["app/page.tsx", "db/portal.ts", "wrangler.jsonc", "management/index.html"]) {
    await assert.rejects(access(new URL(path, root)));
  }
});
