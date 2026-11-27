import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET, TEST_OUTBOX, TEST_PASSWORD } from "./constants";

const COOKIE = "authjs.session-token";
const CHANGED = "a-changed-password-456";
const RESET = "a-reset-password-789";

/** The code in the latest email the server wrote, waiting briefly for it to arrive. */
async function latestCode(): Promise<string> {
  await expect.poll(() => (existsSync(TEST_OUTBOX) ? readFileSync(TEST_OUTBOX, "utf8").trim().length : 0)).toBeGreaterThan(0);
  const lines = readFileSync(TEST_OUTBOX, "utf8").trim().split("\n");
  return JSON.parse(lines.at(-1)!).subject.match(/(\d{6})$/)[1];
}

async function signInWithForm(page: Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_ALLOWED_EMAIL);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Runs last of the browser tests: changing the password signs out every session made before it.
test.describe.serial("security", () => {
  test.beforeAll(() => {
    mkdirSync(dirname(TEST_OUTBOX), { recursive: true });
    writeFileSync(TEST_OUTBOX, "");
  });

  test("the password is changed with a code sent to the primary email, and older sessions end", async ({ page, context, browser }) => {
    // A session cookie like one from signing in, made now.
    const value = await encode({ token: { email: TEST_ALLOWED_EMAIL, signedInAt: Date.now() }, secret: TEST_AUTH_SECRET, salt: COOKIE });
    await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const other = await browser.newContext();
    await other.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);

    await page.setViewportSize({ width: 380, height: 900 });
    await page.goto("/");
    await page.getByRole("link", { name: "Security" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Primary email" })).toContainText("o•••r@example.com");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    const form = page.getByRole("region", { name: "Change password" });
    await form.getByLabel("Current password").fill("not-my-password");
    await form.getByLabel("New password", { exact: true }).fill(CHANGED);
    await form.getByLabel("New password again").fill(CHANGED);
    await form.getByRole("button", { name: "Email me a code" }).click();
    await expect(form.getByRole("status")).toHaveText("Your current password isn't right.");

    await form.getByLabel("Current password").fill(TEST_PASSWORD);
    await form.getByRole("button", { name: "Email me a code" }).click();
    await expect(form).toContainText("We emailed a code to o•••r@example.com");
    const code = await latestCode();

    await form.getByLabel("6-digit code from the email").fill(code === "000000" ? "111111" : "000000");
    await form.getByRole("button", { name: "Confirm and change password" }).click();
    await expect(form.getByRole("status")).toHaveText("That code isn't right. 4 tries left.");
    await form.getByLabel("6-digit code from the email").fill(code);
    await form.getByRole("button", { name: "Confirm and change password" }).click();

    await expect(page).toHaveURL(/\/login\?notice=changed$/);
    await expect(page.getByRole("status")).toHaveText("Your password was changed. Sign in with the new one.");
    // The other browser's session started before the change, so it's turned away.
    expect((await other.request.get("/api/household/remittances/export")).status()).toBe(401);
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    await expect(otherPage).toHaveURL(/\/login\?notice=expired$/);
    await other.close();

    await signInWithForm(page, TEST_PASSWORD);
    await expect(page.getByRole("alert")).toBeVisible();
    await signInWithForm(page, CHANGED);
    await expect(page).toHaveURL(/\/$/);
  });

  test("a forgotten password is reset from the sign-in page with an emailed code", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/login\/reset$/);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByLabel("Email").fill(TEST_ALLOWED_EMAIL);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText(/a 6-digit code is on its way/)).toBeVisible();
    await page.getByLabel("6-digit code from the email").fill(await latestCode());
    await page.getByLabel("New password", { exact: true }).fill(RESET);
    await page.getByLabel("New password again").fill(RESET);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("status")).toHaveText("Your password is reset, and every device was signed out.");
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Your password was reset. Sign in with the new one.");

    await signInWithForm(page, RESET);
    await expect(page).toHaveURL(/\/$/);

    // Signing out everywhere from the Security page ends this session too.
    await page.goto("/security");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/login\?notice=everywhere$/);
    await page.goto("/security");
    await expect(page).toHaveURL(/\/login/);
  });
});
