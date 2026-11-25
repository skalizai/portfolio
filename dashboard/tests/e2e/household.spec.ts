import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET } from "./constants";

const COOKIE = "authjs.session-token";

async function noA11yIssues(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
}

test.describe.serial("household and family", () => {
  test.beforeEach(async ({ context }) => {
    const value = await encode({ token: { email: TEST_ALLOWED_EMAIL }, secret: TEST_AUTH_SECRET, salt: COOKIE });
    await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  });

  test("its routes and files need a session", async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.put("/api/household/settings", { data: {} })).status()).toBe(401);
    expect((await anonymous.get("/api/household/files/anything")).status()).toBe(401);
    await anonymous.dispose();
  });

  test("the section has its tabs in the top bar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Household & Family" }).click();
    await expect(page).toHaveURL(/\/household$/);
    const tabs = page.getByRole("navigation", { name: "Household & Family" });
    for (const name of ["Overview", "Employees", "Advances", "Payroll", "Payslips", "Remittances", "Expenses", "Settings"]) {
      await expect(tabs.getByRole("link", { name })).toBeVisible();
    }
    await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  test("settings are saved and checked", async ({ page, context }) => {
    await page.setViewportSize({ width: 380, height: 900 });
    await page.goto("/household/settings");
    await page.getByLabel("Household or employer name").fill("Alizai Household");
    await page.getByLabel("Default rate (PKR per 1 AED)").fill("76.4");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toHaveText("Settings saved.");
    await page.reload();
    await expect(page.getByLabel("Household or employer name")).toHaveValue("Alizai Household");
    await expect(page.getByLabel("Default rate (PKR per 1 AED)")).toHaveValue("76.4");
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    const bad = await context.request.put("/api/household/settings", { data: { employerName: "X", address: "", defaultPkrPerAed: "0", payrollDay: 28, expiryAlertDays: 60, gratuityDaysPerYear: "14" } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toContain("above zero");
  });
});
