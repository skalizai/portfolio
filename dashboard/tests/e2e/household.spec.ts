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

  test("an employee is added, listed with masked IDs, given a document, exported and removed", async ({ page, context }) => {
    await page.setViewportSize({ width: 380, height: 900 });
    await page.goto("/household/employees");
    await expect(page.getByText("No employees yet.")).toBeVisible();
    await page.getByRole("link", { name: "Add employee" }).click();

    await page.getByLabel("Full name").fill("Maria Santos");
    await page.getByLabel("Role").fill("Maid");
    await page.getByLabel("Nationality").fill("Philippines");
    await page.getByLabel("Passport number").fill("P1234567");
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Visa or permit expiry").fill(soon);
    await page.getByLabel("Emirates ID number").fill("784-1990-1234567-1");
    await page.getByLabel("Joining date").fill("2022-03-01");
    await page.getByLabel("Basic monthly salary (AED)").fill("1800");
    await page.getByRole("button", { name: "Add allowance" }).click();
    await page.getByLabel("Allowance 1 name").fill("Food");
    await page.getByLabel("Allowance 1 amount in AED").fill("200");
    await page.getByLabel("IBAN (optional)").fill("ae07 0331 2345 6789 0123 456");
    await noA11yIssues(page);
    await page.getByRole("button", { name: "Add employee" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Maria Santos" })).toBeVisible();
    await expect(page.getByRole("region", { name: /document needs attention/ })).toContainText("Visa or permit");
    // 4 completed years of 1,800 basic at 14 days a year: 1,800 / 30 x 14 x 4.
    await expect(page.getByRole("region", { name: "Estimated gratuity" })).toContainText("AED 3,360.00");
    await expect(page.getByLabel("IBAN (optional)")).toHaveValue("AE070331234567890123456");

    // A document upload: a tiny real PDF.
    const upload = page.getByRole("region", { name: "Upload a document" });
    await upload.getByLabel("Document").selectOption("PASSPORT");
    await upload.getByLabel(/^File/).setInputFiles({ name: "passport.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await upload.getByRole("button", { name: "Upload" }).click();
    await expect(upload.getByRole("status")).toHaveText("Uploaded.");
    const docs = page.getByRole("region", { name: /^Documents/ });
    await expect(docs).toContainText("passport.pdf");
    const fileHref = await docs.getByRole("link", { name: /View/ }).getAttribute("href");
    const file = await context.request.get(fileHref!);
    expect(file.headers()["content-type"]).toBe("application/pdf");
    // A file that isn't what it claims is refused.
    await upload.getByLabel(/^File/).setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>not a pdf</html>") });
    await upload.getByRole("button", { name: "Upload" }).click();
    await expect(upload.getByRole("status")).toContainText("isn't the type");
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.goto("/household/employees");
    const card = page.getByRole("link", { name: /^Maria Santos Active/ });
    await expect(card).toContainText("AED 2,000.00");
    await expect(card).toContainText("•••• 4567");
    await expect(card).not.toContainText("P1234567");
    await expect(card).toContainText("•••• 67-1");
    await page.getByLabel("Search by name, role, nationality or phone").fill("driver");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No employees match that search.")).toBeVisible();

    const xlsx = await context.request.get("/api/household/employees/export");
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");

    const bad = await context.request.post("/api/household/employees", { data: { fullName: "X", role: "Driver", joiningDate: "2026-01-01", basicSalary: "abc", iban: "" } });
    expect(bad.status()).toBe(400);

    await page.goto("/household/employees");
    await page.getByRole("link", { name: /^Maria Santos Active/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove employee" }).click();
    await expect(page).toHaveURL(/\/household\/employees$/);
    await expect(page.getByText("No employees yet.")).toBeVisible();
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
