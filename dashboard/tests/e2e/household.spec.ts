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

    // The UAE fields are gone: staff are in Pakistan, paid in PKR, by cash or bank transfer.
    await expect(page.getByLabel("Passport number")).toHaveCount(0);
    await expect(page.getByLabel("Annual air ticket")).toHaveCount(0);
    await expect(page.getByLabel("Payment method").locator("option")).toHaveText(["Cash", "Bank transfer"]);

    await page.getByLabel("Full name").fill("Shazia Bibi");
    await page.getByLabel("Role").fill("Maid");
    await page.getByLabel("Nationality").fill("Pakistan");
    await page.getByLabel("CNIC number").fill("3520212345671");
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Cantt Pass number").fill("CP-88231");
    await page.getByLabel("Cantt Pass expiry date").fill(soon);
    await page.getByLabel("Joining date").fill("2022-03-01");
    await page.getByLabel("Basic monthly salary (PKR)").fill("35000");
    await page.getByRole("button", { name: "Add allowance" }).click();
    await page.getByLabel("Allowance 1 name").fill("Food");
    await page.getByLabel("Allowance 1 amount in PKR").fill("3000");
    await page.getByLabel("Payment method").selectOption("BANK_TRANSFER");
    await page.getByLabel("IBAN (optional)").fill("pk36 scbl 0000 0011 2345 6702");
    await noA11yIssues(page);
    await page.getByRole("button", { name: "Add employee" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Shazia Bibi" })).toBeVisible();
    await expect(page.getByRole("region", { name: /document needs attention/ })).toContainText("Cantt Pass");
    // 4 completed years of PKR 35,000 basic at 14 days a year: 35,000 / 30 x 14 x 4 = 65,333.33.
    await expect(page.getByRole("region", { name: "Estimated gratuity" })).toContainText("Rs 65,333");
    await expect(page.getByLabel("CNIC number")).toHaveValue("35202-1234567-1");
    await expect(page.getByLabel("IBAN (optional)")).toHaveValue("PK36SCBL0000001123456702");

    // A document upload: a tiny real PDF.
    const upload = page.getByRole("region", { name: "Upload a document" });
    await upload.getByLabel("Document").selectOption("CNIC");
    await upload.getByLabel(/^File/).setInputFiles({ name: "cnic.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await upload.getByRole("button", { name: "Upload" }).click();
    await expect(upload.getByRole("status")).toHaveText("Uploaded.");
    const docs = page.getByRole("region", { name: /^Documents/ });
    await expect(docs).toContainText("cnic.pdf");
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
    const card = page.getByRole("link", { name: /^Shazia Bibi Active/ });
    await expect(card).toContainText("Rs 38,000");
    await expect(card).toContainText("Bank transfer");
    await expect(card).toContainText("•••• 67-1");
    await expect(card).not.toContainText("35202-1234567-1");
    await expect(card).toContainText("•••• 8231");
    await page.getByLabel("Search by name, role, phone or CNIC").fill("driver");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No employees match that search.")).toBeVisible();

    const xlsx = await context.request.get("/api/household/employees/export");
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");

    const bad = await context.request.post("/api/household/employees", { data: { fullName: "X", role: "Driver", joiningDate: "2026-01-01", basicSalary: "abc", iban: "" } });
    expect(bad.status()).toBe(400);

    await page.goto("/household/employees");
    await page.getByRole("link", { name: /^Shazia Bibi Active/ }).click();
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
