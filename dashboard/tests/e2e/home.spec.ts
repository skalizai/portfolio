import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET } from "./constants";

const COOKIE = "authjs.session-token";

test.describe("Home page and Career menu", () => {
  test.beforeEach(async ({ context }) => {
    const value = await encode({ token: { email: TEST_ALLOWED_EMAIL }, secret: TEST_AUTH_SECRET, salt: COOKIE });
    await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  });

  test("Home greets you and shows family, investments and career at a glance", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    await expect(page.getByText(/\d+ [A-Za-z' ]+ 14\d\d AH/)).toBeVisible();
    await expect(page.getByText("Dubai", { exact: true })).toBeVisible();
    await expect(page.getByText("Pakistan", { exact: true })).toBeVisible();

    const actions = page.getByRole("navigation", { name: "Quick actions" });
    await expect(actions.getByRole("link", { name: "Send home" })).toHaveAttribute("href", "/household/remittances");
    await expect(page.getByRole("region", { name: "Needs your attention" })).toBeVisible();

    await expect(page.getByRole("region", { name: "Household & Family" }).getByRole("link", { name: "Open Household & Family" })).toHaveAttribute("href", "/household");
    await expect(page.getByRole("region", { name: "Investments" })).toBeVisible();
    const career = page.getByRole("region", { name: "Job search" });
    await expect(career.getByRole("link", { name: "See job matches" })).toHaveAttribute("href", "/matches");
    for (const name of ["Applications", "Profile", "Settings", "Logs"]) await expect(career.getByRole("link", { name })).toBeVisible();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 380, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("the Career menu opens, closes with Escape, and leads to each page", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    const toggle = nav.getByRole("button", { name: /Career/ });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: "Settings" })).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Job Matches", "Applications", "Profile", "Settings", "Logs"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();

    await toggle.click();
    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(nav.getByRole("link", { name: "Settings" })).toBeHidden();
    await expect(toggle).toContainText("Settings");
  });
});
