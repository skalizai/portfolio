import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET, TEST_DB_PORT } from "./constants";

const COOKIE = "authjs.session-token";
const CV = { name: "Test Person", headline: "Lead", summary: "Summary.", contact: [], competencies: [], experience: [], education: [], certifications: [], other: [] };

async function signIn(context: BrowserContext) {
  const value = await encode({ token: { email: TEST_ALLOWED_EMAIL }, secret: TEST_AUTH_SECRET, salt: COOKIE });
  await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function seed(id: string, title: string, submitted: boolean, description = "A job.") {
  const client = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres?sslmode=disable` });
  await client.connect();
  await client.query(
    `INSERT INTO jobmatch."Job" (id, source, "sourceJobId", title, company, location, description, url, "applyChannel", "dedupeHash", "postedAt", "fetchedAt")
     VALUES ($1, 'test', $1, $2, 'Board Co', 'Dubai', $3, 'https://example.com/board', 'COMPANY_SITE', $1, now(), now())`,
    [id, title, description],
  );
  await client.query(
    `INSERT INTO jobmatch."MatchScore" (id, "jobId", score, verdict, "matchedSkills", "missingSkills", "keyRequirements", "redFlags", "seniorityFit", "locationFit", reasoning, "modelVersion", "profileUpdatedAt")
     VALUES ($1, $1, 91, 'STRONG', '{}', '{}', '{}', '{}', 'fit', true, 'Reason.', 'test', now())`,
    [id],
  );
  if (submitted !== null) {
    await client.query(
      `INSERT INTO jobmatch."Application" (id, "jobId", status, channel, "coverLetter", "tailoredCv", "submittedAt", "updatedAt")
       VALUES ($1, $2, $3::jobmatch."ApplicationStatus", 'COMPANY_SITE', 'Dear Hiring Manager,', $4::jsonb, $5, now())`,
      [`app-${id}`, id, submitted ? "SUBMITTED" : "DRAFT", JSON.stringify(CV), submitted ? new Date() : null],
    );
  }
  await client.end();
}

async function addJobOnly(id: string, title: string, description = "A job.") {
  const client = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres?sslmode=disable` });
  await client.connect();
  await client.query(
    `INSERT INTO jobmatch."Job" (id, source, "sourceJobId", title, company, location, description, url, "applyChannel", "dedupeHash", "postedAt", "fetchedAt")
     VALUES ($1, 'test', $1, $2, 'Board Co', 'Dubai', $3, 'https://example.com/board', 'COMPANY_SITE', $1, now(), now())`,
    [id, title, description],
  );
  await client.query(
    `INSERT INTO jobmatch."MatchScore" (id, "jobId", score, verdict, "matchedSkills", "missingSkills", "keyRequirements", "redFlags", "seniorityFit", "locationFit", reasoning, "modelVersion", "profileUpdatedAt")
     VALUES ($1, $1, 92, 'STRONG', '{}', '{}', '{}', '{}', 'fit', true, 'Reason.', 'test', now())`,
    [id],
  );
  await client.end();
}

test.describe.serial("applications board", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test("the routes need a session", async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.post("/api/applications/x/status", { data: { status: "OFFER" } })).status()).toBe(401);
    expect((await anonymous.post("/api/jobs/x/email", { data: { email: "a@b.com" } })).status()).toBe(401);
    await anonymous.dispose();
  });

  test("applications appear by stage and can be moved along, with notes", async ({ page, context }) => {
    await seed("board-1", "SAP Board Applied", true);
    await seed("board-2", "SAP Board Draft", false);

    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto("/applications");
    await expect(page.getByRole("region", { name: "Applied" }).getByRole("heading", { name: "SAP Board Applied" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Drafts" }).getByRole("heading", { name: "SAP Board Draft" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.getByLabel(/^Stage\s+for SAP Board Applied/).selectOption("INTERVIEW");
    await expect(page.getByRole("region", { name: "Interview" }).getByRole("heading", { name: "SAP Board Applied" })).toBeVisible();

    await page.getByLabel(/^Notes\s+for SAP Board Applied/).fill("Call on Monday");
    await page.getByRole("button", { name: /Save notes for SAP Board Applied/ }).click();
    await expect(page.getByRole("status").first()).toHaveText("Notes saved.");
    await page.reload();
    await expect(page.getByLabel(/^Notes\s+for SAP Board Applied/)).toHaveValue("Call on Monday");

    // A draft has no stage yet, and can't jump ahead of being applied for.
    await expect(page.getByLabel(/^Stage\s+for SAP Board Draft/)).toBeHidden();
    expect((await context.request.post("/api/applications/app-board-2/status", { data: { status: "OFFER" } })).status()).toBe(409);

    await page.getByRole("button", { name: /Not applying for SAP Board Draft/ }).click();
    await expect(page.getByRole("region", { name: "Closed" }).getByRole("heading", { name: "SAP Board Draft" })).toBeVisible();
  });

  test("the drawer opens from the board, and files can be downloaded", async ({ page, context }) => {
    await page.goto("/applications");
    await page.getByRole("button", { name: /View for SAP Board Applied/ }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "SAP Board Applied at Board Co" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    const letter = await context.request.get("/api/applications/app-board-1/letter");
    expect(letter.headers()["content-type"]).toBe("application/pdf");
  });

  test("you can add, correct and remove an email on a job", async ({ page, context }) => {
    await addJobOnly("mail-add", "SAP Add Email");
    await page.goto("/");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "SAP Add Email" }) });
    await expect(card.getByText("No email to apply to in this listing")).toBeVisible();

    await card.getByRole("button", { name: /Add email for SAP Add Email/ }).click();
    await card.getByLabel(/Email to apply/).fill("Found@Recruiter.example.com");
    await card.getByRole("button", { name: /Save email/ }).click();
    const link = card.getByRole("link", { name: "found@recruiter.example.com" });
    await expect(link).toHaveAttribute("href", /^mailto:found@recruiter\.example\.com\?subject=/);
    await expect(card.getByText("You added this address.")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await card.getByRole("button", { name: /Remove email/ }).click();
    await expect(card.getByText("No email to apply to in this listing")).toBeVisible();

    const bad = await context.request.post("/api/jobs/mail-add/email", { data: { email: "a@b.com,victim@c.com" } });
    expect(bad.status()).toBe(400);
    expect((await context.request.post("/api/jobs/nope/email", { data: { email: "a@b.com" } })).status()).toBe(404);
  });

  test("ticking Applied moves a job to the Applied section, and unticking moves it back", async ({ page, context, playwright, baseURL }) => {
    await addJobOnly("tick-plain", "SAP Tick Plain");
    await seed("tick-draft", "SAP Tick Draft", false);

    await page.goto("/");
    const matches = page.locator("section[aria-label=Jobs] > ul").first();
    await expect(matches.getByRole("heading", { name: "SAP Tick Plain" })).toBeVisible();

    await page.getByRole("checkbox", { name: /Applied\s+for SAP Tick Plain/ }).check();
    await expect(page.getByRole("status").first()).toHaveText("Moved SAP Tick Plain at Board Co to Applied.");
    const appliedSection = page.locator("details").filter({ has: page.getByText(/^Applied \(/) });
    await appliedSection.locator("summary").click();
    await expect(appliedSection.getByRole("heading", { name: "SAP Tick Plain" })).toBeVisible();
    await expect(appliedSection.getByRole("checkbox", { name: /Applied\s+for SAP Tick Plain/ })).toBeChecked();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // It also shows as applied on the Applications page.
    await page.goto("/applications");
    await expect(page.getByRole("region", { name: "Applied" }).getByRole("heading", { name: "SAP Tick Plain" })).toBeVisible();

    // Unticking a job with no cover letter removes the record; a drafted one goes back to being a draft.
    expect(await (await context.request.post("/api/jobs/tick-plain/applied", { data: { applied: false } })).json()).toEqual({ status: "not-applied" });
    await context.request.post("/api/jobs/tick-draft/applied", { data: { applied: true } });
    await context.request.post("/api/jobs/tick-draft/applied", { data: { applied: false } });
    expect(await (await context.request.get("/api/applications/app-tick-draft")).json()).toMatchObject({ status: "DRAFT", submittedAt: null, coverLetter: "Dear Hiring Manager," });

    await page.goto("/");
    await expect(page.locator("section[aria-label=Jobs] > ul").first().getByRole("heading", { name: "SAP Tick Plain" })).toBeVisible();

    expect((await context.request.post("/api/jobs/nope/applied", { data: { applied: true } })).status()).toBe(404);
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.post("/api/jobs/tick-plain/applied", { data: { applied: true } })).status()).toBe(401);
    await anonymous.dispose();
  });

  test("removing your address goes back to the one in the listing", async ({ context }) => {
    await addJobOnly("mail-listing", "SAP Listing Email", "Email your resume to hr@listing.example.com today.");
    const set = await context.request.post("/api/jobs/mail-listing/email", { data: { email: "other@example.com" } });
    expect(await set.json()).toEqual({ applyEmail: "other@example.com" });
    const cleared = await context.request.post("/api/jobs/mail-listing/email", { data: { email: null } });
    expect(await cleared.json()).toEqual({ applyEmail: "hr@listing.example.com" });
  });
});
