import test from "node:test";
import assert from "node:assert/strict";

const FORMS_URL = "https://hatim42.github.io/translator-portal/";
const MANAGEMENT_URL = "https://translator-portal.czzczzhg.workers.dev/";

async function getText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `${url} returned ${response.status}`);
  return response.text();
}

test("production URLs keep their separate identities", async () => {
  const [formsHtml, managementHtml] = await Promise.all([
    getText(FORMS_URL),
    getText(MANAGEMENT_URL),
  ]);

  assert.match(formsHtml, /<title>\s*بوابة المترجم\s*<\/title>/i);
  assert.doesNotMatch(formsHtml, /<title>\s*منصة المترجمين\s*<\/title>/i);
  assert.ok((formsHtml.match(/https:\/\/forms\.gle\//g) ?? []).length >= 4);

  assert.match(managementHtml, /<title>\s*منصة المترجمين\s*<\/title>/i);
  assert.doesNotMatch(managementHtml, /<title>\s*بوابة المترجم\s*<\/title>/i);
});
