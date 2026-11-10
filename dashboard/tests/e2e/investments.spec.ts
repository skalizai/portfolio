import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET } from "./constants";

const COOKIE = "authjs.session-token";

async function noA11yIssues(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
}

async function addTransaction(page: Page, fields: { type: string; symbol?: string; name?: string; kind?: string; shares?: string; price?: string; amount?: string; fees?: string; date?: string }) {
  const form = page.getByRole("region", { name: "Add a transaction" });
  await form.getByLabel("Type").selectOption(fields.type);
  if (fields.date) await form.getByLabel("Date").fill(fields.date);
  if (fields.symbol) await form.getByLabel("Symbol").fill(fields.symbol);
  if (fields.name) await form.getByLabel(/^Name/).fill(fields.name);
  if (fields.kind) await form.getByLabel(/^Kind/).selectOption(fields.kind);
  if (fields.shares) await form.getByLabel(/^Shares|^Ratio/).fill(fields.shares);
  if (fields.price) await form.getByLabel("Price per share").fill(fields.price);
  if (fields.amount) await form.getByLabel("Amount").fill(fields.amount);
  if (fields.fees) await form.getByLabel(/^Fees|^Tax withheld/).fill(fields.fees);
  await form.getByRole("button", { name: "Save transaction" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
}

test.describe.serial("investments", () => {
  test.beforeEach(async ({ context }) => {
    const value = await encode({ token: { email: TEST_ALLOWED_EMAIL }, secret: TEST_AUTH_SECRET, salt: COOKIE });
    await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  });

  test("the routes need a session", async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.get("/api/investments/accounts")).status()).toBe(401);
    expect((await anonymous.post("/api/investments/transactions", { data: {} })).status()).toBe(401);
    expect((await anonymous.post("/api/investments/prices", { data: {} })).status()).toBe(401);
    await anonymous.dispose();
  });

  test("an empty portfolio explains how to start", async ({ page }) => {
    await page.goto("/investments");
    await expect(page.getByRole("heading", { name: "Start tracking your portfolio" })).toBeVisible();
    await noA11yIssues(page);
  });

  test("accounts are added with one click and can't be deleted once used", async ({ page }) => {
    await page.goto("/investments/accounts");
    await page.getByRole("button", { name: "+ Interactive Brokers (USD)" }).click();
    await expect(page.getByRole("status").first()).toHaveText("Added Interactive Brokers.");
    await page.getByRole("button", { name: "+ Sarwa (USD)" }).click();
    await expect(page.getByText("Sarwa · USD", { exact: false })).toBeVisible();
    await noA11yIssues(page);
  });

  test("transactions build holdings, average cost and profit in AED", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 900 });
    await page.goto("/investments/transactions");
    await addTransaction(page, { type: "DEPOSIT", amount: "10000", date: "2026-01-02" });
    await addTransaction(page, { type: "BUY", symbol: "voo", name: "Vanguard S&P 500 ETF", kind: "ETF", shares: "10", price: "400", fees: "1", date: "2026-01-05" });
    await addTransaction(page, { type: "BUY", symbol: "VOO", shares: "10", price: "500", fees: "1", date: "2026-02-05" });
    await addTransaction(page, { type: "SELL", symbol: "VOO", shares: "5", price: "520", fees: "1", date: "2026-03-05" });
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.goto("/investments");
    const holdings = page.getByRole("region", { name: "Holdings table" });
    const voo = holdings.getByRole("row").filter({ hasText: "VOO" });
    await expect(voo).toContainText("Vanguard S&P 500 ETF · ETF");
    await expect(voo).toContainText("15");
    // 9,002 USD cost over 20 shares is 450.10 a share, which a partial sell doesn't change.
    await expect(voo).toContainText("450.1 USD");
    await expect(voo).toContainText("last trade");
    // Realised: (2,600 - 1) - 5 x 450.10 = 348.50 USD, which is 1,279.87 AED at the peg.
    await expect(page.getByText("Realised", { exact: true }).locator("..")).toContainText("▲ +AED 1,280");
    await expect(page.getByRole("region", { name: "By type" })).toContainText("ETFs");

    // The interactive overview: bars per month, a carousel of accounts and the top holdings.
    const summary = page.getByRole("region", { name: "Portfolio summary and monthly activity" });
    await expect(summary.getByRole("heading", { level: 1 })).toContainText("Your portfolio");
    await expect(page.getByRole("region", { name: "Top holdings" }).getByRole("img", { name: /^VOO, Vanguard S&P 500 ETF: AED/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Accounts" })).toContainText("Interactive Brokers");
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    // A price you enter replaces the last trade price.
    await voo.getByLabel(/New price for VOO/).fill("600");
    await voo.getByRole("button", { name: /Set/ }).click();
    await expect(voo).toContainText("as of");
    // 15 x 600 = 9,000 USD against 6,751.50 left, so +2,248.50 USD.
    await expect(voo).toContainText("▲ +AED 8,257.62");
  });

  test("the sample preview is labelled, filters by month, switches series and steps through accounts", async ({ page }) => {
    await page.goto("/investments?preview=sample");
    await expect(page.getByRole("note")).toContainText("Sample data");
    await expect(page.getByText("Not available in the sample preview.")).toBeVisible();
    await noA11yIssues(page);

    // Selecting a month narrows the transactions to it; selecting it again shows everything.
    const bars = page.getByRole("group", { name: /Last 12 months/ });
    const lastMonth = bars.getByRole("button").last();
    await lastMonth.click();
    await expect(lastMonth).toHaveAttribute("aria-pressed", "true");
    const list = page.getByRole("region", { name: "Recent transactions" });
    await expect(list.getByRole("heading")).toContainText("·");
    await list.getByRole("button", { name: "Show all" }).click();
    await expect(lastMonth).toHaveAttribute("aria-pressed", "false");

    // Arrow keys move between months, and the series switch changes what the bars show.
    await lastMonth.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(bars.getByRole("button").nth(10)).toBeFocused();
    await page.getByRole("button", { name: "Dividends", exact: true }).click();
    await expect(page.getByRole("button", { name: "Dividends", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: /Last 12 months · Dividends/ })).toBeVisible();

    const accounts = page.getByRole("region", { name: "Accounts" });
    await expect(accounts).toContainText("1 of 2");
    await accounts.getByRole("button", { name: "Next account" }).click();
    await expect(accounts).toContainText("2 of 2");
    await expect(accounts.getByRole("button", { name: /^Sarwa/ })).toHaveAttribute("aria-current", "true");

    // Prices can't be set on made-up holdings.
    await expect(page.getByLabel(/New price for/)).toHaveCount(0);

    await page.setViewportSize({ width: 380, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("bad input is explained, and a transaction can be deleted", async ({ page, context }) => {
    const accounts = await (await context.request.get("/api/investments/accounts")).json();
    const bad = await context.request.post("/api/investments/transactions", { data: { accountId: accounts[0].id, type: "BUY", date: "2026-01-05", currency: "USD", symbol: "VOO" } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toContain("shares");
    expect((await context.request.post("/api/investments/transactions", { data: { accountId: "nope", type: "DEPOSIT", date: "2026-01-05", currency: "USD", amount: "1" } })).status()).toBe(404);
    expect((await context.request.delete(`/api/investments/accounts/${accounts[0].id}`)).status()).toBe(409);

    await page.goto("/investments/transactions");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Delete Sell VOO/ }).click();
    await expect(page.getByRole("heading", { name: "History (3)" })).toBeVisible();
  });
});
