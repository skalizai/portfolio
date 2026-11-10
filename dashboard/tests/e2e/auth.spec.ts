import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET, TEST_CRON_SECRET, TEST_PASSWORD } from "./constants";

const PAGES = ["/", "/matches", "/applications", "/profile", "/settings", "/logs", "/investments", "/investments/transactions", "/investments/accounts"];
const NARROW = { width: 380, height: 800 };
const COOKIE = "authjs.session-token";

/** Signs in by writing a real session cookie, which keeps most tests quick. The login form has its own tests. */
async function signInAs(context: BrowserContext, email: string) {
  const value = await encode({ token: { email, name: "Test" }, secret: TEST_AUTH_SECRET, salt: COOKIE });
  await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("signed out", () => {
  test("every page redirects to login", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("API routes return 401, and the cron route needs the right secret", async ({ request }) => {
    expect((await request.get("/api/stats")).status()).toBe(401);
    expect((await request.get("/api/jobs")).status()).toBe(401);
    expect((await request.post("/api/jobs/fetch")).status()).toBe(401);

    const wrong = await request.post("/api/jobs/fetch", { headers: { authorization: "Bearer nope" } });
    expect(wrong.status()).toBe(401);

    const right = await request.post("/api/jobs/fetch", {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    });
    expect(right.status()).toBe(200);
    expect(await right.json()).toMatchObject({ sources: {}, inserted: 0 });

    // The cron secret only opens that one route.
    const elsewhere = await request.put("/api/profile", {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      data: {},
    });
    expect(elsewhere.status()).toBe(401);
  });

  test("the login page is accessible and fits 380 px", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test("a rejected login explains why", async ({ page }) => {
    await page.goto("/login?error=CredentialsSignin");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("don't match");
  });
});

test.describe.serial("signing in with email and password", () => {
  async function submit(page: Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  test("your email and password sign you in, and sign out ends it", async ({ page }) => {
    await submit(page, TEST_ALLOWED_EMAIL.toUpperCase(), TEST_PASSWORD);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/matches");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a wrong password or another email is refused", async ({ page }) => {
    await submit(page, TEST_ALLOWED_EMAIL, "not-the-password");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("don't match");
    await submit(page, "someone@example.com", TEST_PASSWORD);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("don't match");
  });

  test("after five wrong attempts even the right password waits", async ({ page }) => {
    // Two failures above, three more here.
    for (let i = 0; i < 3; i++) await submit(page, TEST_ALLOWED_EMAIL, `wrong-${i}`);
    await submit(page, TEST_ALLOWED_EMAIL, TEST_PASSWORD);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many wrong attempts");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("session for another email", () => {
  test("is rejected on pages and API routes", async ({ page, context }) => {
    await signInAs(context, "other@example.com");
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get("/api/stats")).status()).toBe(401);
  });
});

test.describe("signed in as the owner", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, TEST_ALLOWED_EMAIL);
  });

  test("every page loads, is accessible in both themes and fits 380 px", async ({ page }) => {
    await page.setViewportSize(NARROW);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
    }

    await page.getByRole("button", { name: /light and dark/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expectAccessible(page);
  });

  test("the login page sends the owner home", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
  });

  test("uses its own evergreen theme and display font by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(7, 17, 14)");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /Sora/i);
  });
});
