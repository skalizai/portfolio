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
    await expect(page.getByText(/gratuity/i)).toHaveCount(0);
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
    await expect(page.getByRole("status").first()).toHaveText("Settings saved.");
    await page.reload();
    await expect(page.getByLabel("Household or employer name")).toHaveValue("Alizai Household");
    await expect(page.getByLabel("Default rate (PKR per 1 AED)")).toHaveValue("76.4");
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    const bad = await context.request.put("/api/household/settings", { data: { employerName: "X", address: "", defaultPkrPerAed: "0", payrollDay: 28, expiryAlertDays: 60 } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toContain("above zero");
  });

  test("an advance is recorded and a month skipped, then payroll is run, approved, paid and reopened", async ({ page, context }) => {
    const month = new Date().toISOString().slice(0, 7);
    const created = await context.request.post("/api/household/employees", {
      data: { fullName: "Aslam Khan", role: "Driver", joiningDate: "2024-01-01", basicSalary: "36000", allowances: [{ name: "Fuel", amount: "4000" }], iban: "" },
    });
    expect(created.status()).toBe(201);

    // An advance of 15,000 repaid at 5,000 a month from this month.
    await page.setViewportSize({ width: 380, height: 900 });
    await page.goto("/household/advances");
    const form = page.getByRole("region", { name: "Record an advance" });
    await form.getByLabel("Amount (PKR)").fill("15000");
    await form.getByLabel("Reason").fill("Medical");
    await form.getByLabel("Fixed monthly installment").check();
    await form.getByLabel("Repaid each month (PKR)").fill("5000");
    await form.getByLabel(/First month/).fill(month);
    await form.getByRole("button", { name: "Record advance" }).click();
    await expect(form.getByRole("status")).toHaveText("Advance recorded.");
    const advance = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /Aslam Khan · Rs 15,000/ }) });
    await expect(advance).toContainText("Outstanding");
    await expect(advance.getByRole("button", { name: /^Change .* repayment for/ })).toHaveCount(3);
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    // A custom schedule that doesn't add up is refused.
    await form.getByLabel("Amount (PKR)").fill("10000");
    await form.getByLabel("Custom schedule").check();
    await form.getByLabel("Amount for month 1 in PKR").fill("4000");
    await form.getByRole("button", { name: "Record advance" }).click();
    await expect(form.getByRole("status")).toContainText("adds up to 4000.00");

    // Run payroll: the first installment is deducted automatically.
    await page.goto("/household/payroll");
    await page.getByLabel("Month").fill(month);
    await page.getByRole("button", { name: "Run payroll" }).click();
    await expect(page).toHaveURL(new RegExp(`/household/payroll/${month}$`));
    const line = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Aslam Khan" }) });
    await expect(line).toContainText("Advance repayment (Medical)");
    await expect(line).toContainText("Rs 35,000");

    // A second run for the same month is refused.
    expect((await context.request.post("/api/household/payroll", { data: { month } })).status()).toBe(409);

    // Eid gift and two unpaid days: 36,000 + 4,000 + 5,000 - 2,400 - 5,000 = 37,600.
    await line.getByRole("button", { name: /Add earning/ }).click();
    await line.getByLabel(/Earning 1 type/).selectOption("EID_GIFT");
    await line.getByLabel(/Earning 1 amount/).fill("5000");
    await line.getByLabel(/Unpaid leave days/).fill("2");
    await line.getByRole("button", { name: /^Save/ }).click();
    await expect(line.getByRole("status")).toHaveText("Saved.");
    await expect(line).toContainText("Unpaid leave (2 days)");
    await expect(line).toContainText("Rs 37,600");
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    // Approving locks it.
    await page.getByRole("button", { name: "Approve payroll" }).click();
    await expect(page.getByText("Locked", { exact: true })).toBeVisible();
    await expect(line.getByRole("button", { name: /^Save/ })).toHaveCount(0);

    // Paying records the advance repayment and creates the payslip.
    await page.getByLabel("Paid by").selectOption("Bank transfer");
    await page.getByLabel(/Reference/).fill("HBL-7781");
    await page.getByRole("button", { name: "Mark as paid" }).click();
    await expect(page.getByText(/Paid \d+ \w+ \d{4} by bank transfer · ref HBL-7781/)).toBeVisible();

    await page.goto("/household/advances");
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /Aslam Khan · Rs 15,000/ }) })).toContainText("Paid");

    const xlsx = await context.request.get(`/api/household/payroll/export?month=${month}`);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");

    // The payslip: listed, viewable for printing (without the menus), as a PDF and in the month's ZIP.
    await page.goto("/household/payslips");
    const slipRow = page.getByRole("listitem").filter({ hasText: "Aslam Khan" });
    await expect(slipRow).toContainText("Rs 37,600");
    await noA11yIssues(page);
    const pdfHref = await slipRow.getByRole("link", { name: /^PDF/ }).getAttribute("href");
    const pdf = await context.request.get(pdfHref!);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.headers()["content-disposition"]).toContain(`Payslip%20${month}%20Aslam%20Khan.pdf`);
    const zip = await context.request.get(`/api/household/payslips/zip?month=${month}`);
    expect(zip.headers()["content-type"]).toBe("application/zip");
    expect((await zip.body()).toString("latin1")).toContain(`Payslip ${month} Aslam Khan.pdf`);

    await slipRow.getByRole("link", { name: /View and print/ }).click();
    const slip = page.getByRole("article", { name: "Payslip" });
    await expect(slip).toContainText("Net pay");
    await expect(slip).toContainText("Rs 37,600");
    await expect(slip).toContainText("Advance repayment (Medical)");
    await expect(slip).toContainText("Advance balance remaining");
    await expect(slip).toContainText("Rs 10,000");
    await expect(slip).toContainText("Received by (employee signature)");
    await expect(slip).toContainText("Bank transfer");
    await noA11yIssues(page);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
    await expect(slip).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    // Reopening needs a reason, and unlocks the month.
    await page.goto(`/household/payroll/${month}`);
    page.once("dialog", (dialog) => dialog.accept("Forgot overtime"));
    await page.getByRole("button", { name: "Reopen to make changes" }).click();
    await expect(page.getByRole("button", { name: "Approve payroll" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Aslam Khan" }) }).getByRole("button", { name: /^Save/ })).toBeVisible();
    // Reopening withdraws the month's payslips until it's paid again.
    expect((await context.request.get(`/api/household/payslips/zip?month=${month}`)).status()).toBe(404);

    // Skipping the next month's repayment moves it to a new month at the end.
    await page.goto("/household/advances");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /Aslam Khan · Rs 15,000/ }) });
    await card.getByRole("button", { name: /^Change .* repayment for/ }).nth(1).click();
    await card.getByLabel("Amount (0 skips)").fill("0");
    await card.getByLabel("Note").fill("Eid month");
    await card.getByRole("button", { name: /^Save/ }).click();
    await expect(card).toContainText("Skipped · Eid month");
    await expect(card.getByRole("button", { name: /^Change .* repayment for/ })).toHaveCount(3);

    // Changing the monthly amount re-plans what's due around the skipped month, still repaying 15,000.
    await card.getByRole("button", { name: /Change monthly amount/ }).click();
    await card.getByLabel("Repaid each month (PKR)").fill("7500");
    await card.getByLabel("Starting from").fill(month);
    await card.getByRole("button", { name: /^Save new monthly amount/ }).click();
    await expect(card.getByRole("button", { name: /^Change .* repayment for/ })).toHaveCount(2);
    await expect(card.getByText(/Rs\s7,500 · Due/)).toHaveCount(2);
    await expect(card).toContainText("Skipped · Eid month");
    await page.goto(`/household/payroll/${month}`);
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Aslam Khan" }) })).toContainText("Rs 35,100");
  });

  test("money sent home is recorded at a rate, totalled against a target, edited, exported and removed", async ({ page, context }) => {
    await page.setViewportSize({ width: 380, height: 900 });
    await page.goto("/household/remittances");
    await expect(page.getByText("No transfers yet.")).toBeVisible();

    const recipients = page.getByRole("region", { name: "Recipients" });
    await expect(recipients).toContainText("Wife");
    await recipients.getByLabel("Name").last().fill("Mother");
    await recipients.getByLabel("Relationship").last().selectOption("MOTHER");
    await recipients.getByLabel("Monthly target (AED, optional)").last().fill("1000");
    await recipients.getByRole("button", { name: "Add recipient" }).click();
    await expect(recipients).toContainText("Target AED");

    const form = page.getByRole("region", { name: "Record a transfer" });
    await form.getByLabel("Sent to").selectOption({ label: "Mother" });
    await form.getByLabel("Sent (AED)").fill("500");
    await form.getByLabel("Rate (PKR per 1 AED)").fill("76.25");
    await expect(form.getByText(/38,125 at this rate/)).toBeVisible();
    await form.getByLabel("Fee (AED)").fill("10");
    await form.getByLabel("Purpose").selectOption("MEDICAL");
    await form.getByRole("button", { name: "Record transfer" }).click();
    await expect(form.getByRole("status")).toHaveText("Transfer recorded.");

    await expect(page.getByRole("region", { name: /Monthly targets/ }).getByRole("progressbar", { name: /Mother: 50%/ })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: "Mother ·" }).filter({ hasText: "Medical" });
    await expect(row).toContainText(/38,125/);
    await expect(page.getByText("Average rate", { exact: true })).toBeVisible();
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    // What actually arrived can be entered instead of the worked-out figure.
    await row.getByRole("link", { name: /^Edit/ }).click();
    await expect(page.getByRole("heading", { name: "Edit transfer" })).toBeVisible();
    await page.getByLabel("Received (PKR)").fill("38000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/household\/remittances$/);
    await expect(page.getByRole("listitem").filter({ hasText: "Mother ·" }).filter({ hasText: "Medical" })).toContainText(/38,000/);

    const xlsx = await context.request.get("/api/household/remittances/export");
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    expect((await context.request.post("/api/household/remittances", { multipart: { date: "2026-11-01", recipientId: "recipient-wife", amountAed: "0", rate: "76" } })).status()).toBe(400);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("listitem").filter({ hasText: "Mother ·" }).filter({ hasText: "Medical" }).getByRole("button", { name: /^Remove/ }).click();
    await expect(page.getByText("No transfers yet.")).toBeVisible();
  });

  test("expenses in PKR are converted, budgets alert, and monthly expenses arrive to confirm", async ({ page, context }) => {
    await page.setViewportSize({ width: 380, height: 900 });
    await page.goto("/household/expenses");

    await page.getByText("Categories and budgets").click();
    await page.getByLabel("Monthly budget for Groceries in AED").fill("100");
    await page.getByRole("button", { name: "Save Groceries" }).click();

    const form = page.getByRole("region", { name: "Add an expense" });
    await form.getByLabel("Category").selectOption({ label: "Groceries" });
    await form.getByLabel("Amount").fill("150");
    await form.getByRole("button", { name: "Add expense" }).click();
    await expect(form.getByRole("status")).toHaveText("Expense added.");
    await expect(page.getByRole("region", { name: /budget needs attention/ })).toContainText("Groceries: over budget");

    await form.getByLabel("Category").selectOption({ label: "Medical" });
    await form.getByLabel("Amount").fill("7625");
    await form.getByLabel("Currency").selectOption("PKR");
    await form.getByLabel("Rate (PKR per 1 AED)").fill("76.25");
    await form.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Medical ·" })).toContainText(/≈ AED\s100\.00/);

    const monthly = page.getByRole("region", { name: "Monthly expenses" });
    await monthly.getByLabel("Name").fill("Rent");
    await monthly.getByLabel("Category").selectOption({ label: "Rent" });
    await monthly.getByLabel("Amount").fill("6000");
    await monthly.getByLabel("Day of the month").fill("1");
    await monthly.getByRole("button", { name: "Add monthly expense" }).click();
    await expect(monthly).toContainText("Rent · Rent");
    const rent = page.getByRole("listitem").filter({ hasText: "Rent ·" }).filter({ hasText: "monthly" });
    await expect(rent).toContainText("To confirm");
    await rent.getByRole("button", { name: /^Confirm/ }).click();
    await expect(rent).toContainText("Confirmed");
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Rent ·" }).filter({ hasText: "monthly" })).toHaveCount(1);
    await noA11yIssues(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    const xlsx = await context.request.get("/api/household/expenses/export");
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("demo data loads, fills the overview and home card, and clears", async ({ page }) => {
    await page.goto("/household/settings");
    await page.getByRole("button", { name: "Load demo data" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Demo data" })).toHaveText("Demo data loaded.");

    await page.goto("/household");
    await expect(page.getByText("Payroll paid", { exact: true })).toBeVisible();
    await expect(page.getByText("Monthly outflow, last 6 months")).toBeVisible();
    await expect(page.getByRole("figure", { name: /Sent home by recipient/ })).toContainText("Mother (demo)");
    await expect(page.getByRole("region", { name: "Open advances" })).toContainText("Aslam Khan (demo)");
    await noA11yIssues(page);
    await page.setViewportSize({ width: 380, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.goto("/");
    await expect(page.getByRole("region", { name: "Household & Family" }).getByRole("link", { name: /Overview/ })).toContainText(/employees? ·/);

    await page.goto("/household/settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Clear demo data" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Demo data" })).toHaveText("Demo data cleared.");
    await page.goto("/household/employees");
    await expect(page.getByText("Aslam Khan (demo)")).toHaveCount(0);
  });
});
