import { expect, request, test } from "@playwright/test";
import { translatorSeeds } from "../../db/seed-data";

test.describe.serial("translator operations", () => {
  test.beforeAll(async ({ baseURL }) => {
    const api = await request.newContext({
      baseURL,
      extraHTTPHeaders: { "x-e2e-user": "owner" },
    });
    await api.get("/api/portal");
    const reset = await api.post("/api/portal", { data: { action: "e2e-reset" } });
    expect(reset.ok()).toBeTruthy();
    await api.dispose();
  });

  test("production login creates secure owner and translator sessions", async ({ browser, baseURL }) => {
    const person = translatorSeeds[0];
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "مرحباً بك" })).toBeVisible();

    await page.getByRole("button", { name: "المشرف", exact: true }).click();
    await page.getByTestId("login-code").fill("E2E-OWNER-CODE-2026");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("user-name")).toHaveText("المشرف");

    await page.getByRole("button", { name: "المترجمون", exact: true }).first().click();
    const personCard = page.locator(".person-card").filter({ hasText: person.name });
    await personCard.getByRole("button", { name: "إنشاء رمز", exact: true }).click();
    const accessCode = (await page.getByTestId("invite-code").textContent())?.trim();
    expect(accessCode).toMatch(/^[A-Z2-9]{12}$/);
    await page.getByRole("dialog").locator(".modal-close").click();

    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page.getByRole("heading", { name: "مرحباً بك" })).toBeVisible();
    await page.getByTestId("login-username").fill(person.username);
    await page.getByTestId("login-code").fill(accessCode!);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("user-name")).toHaveText(person.name);

    await context.close();
    const resetApi = await request.newContext({
      baseURL,
      extraHTTPHeaders: { "x-e2e-user": "owner" },
    });
    const reset = await resetApi.post("/api/portal", { data: { action: "e2e-reset" } });
    expect(reset.ok()).toBeTruthy();
    await resetApi.dispose();
  });

  test("all 46 translators can sign in and submit monthly preferences", async ({ browser, baseURL }) => {
    for (const [index, person] of translatorSeeds.entries()) {
      const context = await browser.newContext({
        baseURL,
        extraHTTPHeaders: { "x-e2e-user": person.username },
      });
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByTestId("user-name")).toHaveText(person.name);
      await page.getByRole("button", { name: "رغبتي", exact: true }).first().click();
      await page.getByTestId("preferred-shift").selectOption({ index: index % 2 });
      await page.getByTestId("preferred-rest").selectOption({ index: index % 7 });
      await page.getByTestId("save-preference").click();
      await expect(page.getByRole("status")).toContainText("تم حفظ رغبتك");
      await context.close();
    }
  });

  test("ten translators record complete daily statistics", async ({ browser, baseURL }) => {
    for (const [index, person] of translatorSeeds.slice(0, 10).entries()) {
      const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-e2e-user": person.username } });
      const page = await context.newPage();
      await page.goto("/");
      await page.getByRole("button", { name: "التسجيل", exact: true }).first().click();
      const form = page.getByTestId("stats-form");
      await form.getByLabel("عدد المستفيدين").fill(String(25 + index));
      await form.getByLabel("الجلسات أو الجولات").fill(String(2 + index % 3));
      await form.getByLabel("ملاحظة").fill("سجل تشغيلي لاختبار اكتمال المسار");
      await form.getByRole("button", { name: "حفظ الإحصاء" }).click();
      await expect(page.getByRole("status")).toContainText("تم حفظ الإحصاء");
      await context.close();
    }
  });

  test("leave and shift-change requests reach the owner and are approved", async ({ browser, baseURL }) => {
    const leaveContext = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-e2e-user": "shakeel" } });
    const leavePage = await leaveContext.newPage();
    await leavePage.goto("/");
    await leavePage.getByRole("button", { name: "طلباتي", exact: true }).first().click();
    await leavePage.getByTestId("new-request").click();
    await leavePage.getByLabel("من تاريخ").fill("2026-09-10");
    await leavePage.getByLabel("إلى تاريخ").fill("2026-09-12");
    await leavePage.getByTestId("request-reason").fill("ظرف عائلي يتطلب إجازة قصيرة");
    await leavePage.getByTestId("submit-request").click();
    await expect(leavePage.getByRole("status")).toContainText("تم إرسال الطلب");
    await leaveContext.close();

    const shiftContext = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-e2e-user": "masood" } });
    const shiftPage = await shiftContext.newPage();
    await shiftPage.goto("/");
    await shiftPage.getByRole("button", { name: "طلباتي", exact: true }).first().click();
    await shiftPage.getByTestId("new-request").click();
    await shiftPage.getByTestId("request-type").selectOption("shift");
    await shiftPage.getByLabel("الوردية المطلوبة").selectOption({ index: 1 });
    await shiftPage.getByTestId("request-reason").fill("ارتباط دراسي يتوافق مع الوردية الثانية");
    await shiftPage.getByTestId("submit-request").click();
    await expect(shiftPage.getByRole("status")).toContainText("تم إرسال الطلب");
    await shiftContext.close();

    const ownerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-e2e-user": "owner" } });
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/");
    await expect(ownerPage.getByText("46/46").first()).toBeVisible();
    await ownerPage.getByRole("button", { name: "الطلبات", exact: true }).first().click();
    await ownerPage.getByLabel("اعتماد طلب شكيل الرحمن").click();
    await expect(ownerPage.getByRole("status")).toContainText("تم اعتماد الطلب");
    await ownerPage.getByLabel("اعتماد طلب مسعود الرحمن").click();
    await expect(ownerPage.getByRole("status")).toContainText("تم اعتماد الطلب");
    await ownerContext.close();
  });

  test("attendance and installable assets are available", async ({ browser, baseURL, request: api }) => {
    const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-e2e-user": "shakeel" } });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "تسجيل الحضور" }).first().click();
    await expect(page.getByRole("status")).toContainText("تم تسجيل الحضور");
    await context.close();
    expect((await api.get("/manifest.webmanifest")).ok()).toBeTruthy();
    expect((await api.get("/sw.js")).ok()).toBeTruthy();
  });

  test("filtered distribution preserves every translator assignment", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-e2e-user": "owner" } });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "التوزيع", exact: true }).first().click();
    await page.getByPlaceholder("ابحث بالاسم أو اللغة...").fill("شكيل");
    await page.getByRole("button", { name: "حفظ التوزيع" }).click();
    await expect(page.getByRole("status")).toContainText("تم حفظ التوزيع");
    await context.close();

    const api = await request.newContext({ baseURL, extraHTTPHeaders: { "x-e2e-user": "owner" } });
    const response = await api.get("/api/portal");
    const payload = await response.json() as { people: Array<{ shift: string; rest_day: string }> };
    expect(payload.people).toHaveLength(46);
    expect(payload.people.every((person) => person.shift !== "null" && person.rest_day !== "null")).toBeTruthy();
    await api.dispose();
  });

  test("desktop and mobile layouts stay within the viewport", async ({ browser, baseURL }) => {
    const viewports = [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: viewport.width, height: viewport.height },
        extraHTTPHeaders: { "x-e2e-user": "owner" },
      });
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByTestId("user-name")).toHaveText("المشرف");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/layout-${viewport.name}.png`, fullPage: true });
      await context.close();
    }
  });
});
