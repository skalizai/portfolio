import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET } from "./constants";

const COOKIE = "authjs.session-token";

test.describe("landing page and Job Dashboard menu", () => {
  test.beforeEach(async ({ context }) => {
    const value = await encode({ token: { email: TEST_ALLOWED_EMAIL }, secret: TEST_AUTH_SECRET, salt: COOKIE });
    await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  });

  test("the landing page shows the summary and links to every section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");
    await expect(page.getByRole("link", { name: "View job matches" })).toHaveAttribute("href", "/matches");
    await expect(page.getByText("Years in SAP")).toBeVisible();

    const sections = page.getByRole("region", { name: "Job Dashboard" });
    for (const name of ["Job Matches", "Applications", "Profile", "Settings", "Logs"]) {
      await expect(sections.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("the Job Dashboard menu opens, closes with Escape, and leads to each page", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    const toggle = nav.getByRole("button", { name: /Job Dashboard/ });

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
