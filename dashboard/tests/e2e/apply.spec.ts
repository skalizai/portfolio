import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET, TEST_CRON_SECRET, TEST_DB_PORT } from "./constants";

const COOKIE = "authjs.session-token";

const CV = {
  name: "Test Person",
  headline: "SAP Integration Architect",
  summary: "An SAP integration lead.",
  contact: ["person@example.com"],
  competencies: ["CPI integration", "ABAP development"],
  experience: [{ role: "Technical Architect", company: "Acme", location: "Dubai", dates: "2020 to 2024", bullets: ["Led a team of 10", "Built CPI interfaces"] }],
  education: ["BSc Computer Science"],
  certifications: ["SAP Certified"],
  other: [{ title: "Languages", items: ["English"] }],
};

async function signIn(context: BrowserContext) {
  const value = await encode({ token: { email: TEST_ALLOWED_EMAIL }, secret: TEST_AUTH_SECRET, salt: COOKIE });
  await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function withDb<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres?sslmode=disable` });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function addScoredJob(id: string, title: string, channel: string, draft: boolean) {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO jobmatch."Job" (id, source, "sourceJobId", title, company, location, description, url, "applyChannel", "dedupeHash", "postedAt", "fetchedAt")
       VALUES ($1, 'test', $1, $2, 'Drafting Co', 'Dubai', 'A job.', 'https://example.com/apply', $3::jobmatch."ApplyChannel", $1, now(), now())`,
      [id, title, channel],
    );
    await client.query(
      `INSERT INTO jobmatch."MatchScore" (id, "jobId", score, verdict, "matchedSkills", "missingSkills", "keyRequirements", "redFlags", "seniorityFit", "locationFit", reasoning, "modelVersion", "profileUpdatedAt")
       VALUES ($1, $1, 99, 'STRONG', '{}', '{}', '{}', '{}', 'fit', true, 'Reason.', 'test', now())`,
      [id],
    );
    if (draft) {
      await client.query(
        `INSERT INTO jobmatch."Application" (id, "jobId", channel, "coverLetter", "tailoredCv", "draftWarnings", "updatedAt")
         VALUES ($1, $4, $2::jobmatch."ApplyChannel", 'Dear Hiring Manager,', $3::jsonb, '{"Check this: TOGAF."}', now())`,
        [`app-${id}`, channel, JSON.stringify(CV), id],
      );
    }
  });
}

test.describe.serial("drafts", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test("the application routes need a session, and the cron secret opens only the morning run", async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.post("/api/applications", { data: { jobIds: ["x"] } })).status()).toBe(401);
    expect((await anonymous.get("/api/applications/x")).status()).toBe(401);
    expect((await anonymous.get("/api/applications/x/cv")).status()).toBe(401);
    expect((await anonymous.post("/api/applications/x/mark-submitted")).status()).toBe(401);
    expect((await anonymous.post("/api/jobs/x/state", { data: { state: "DISMISSED" } })).status()).toBe(401);
    expect((await anonymous.post("/api/applications/auto")).status()).toBe(401);

    const headers = { authorization: `Bearer ${TEST_CRON_SECRET}` };
    expect((await anonymous.post("/api/applications/auto", { headers })).status()).toBe(200);
    expect((await anonymous.get("/api/applications/x", { headers })).status()).toBe(401);
    expect((await anonymous.post("/api/applications/x/mark-submitted", { headers })).status()).toBe(401);
    await anonymous.dispose();
  });

  test("a draft can be reviewed and edited, and downloads as a real PDF", async ({ page, context }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await addScoredJob("draft-1", "SAP Draft Lead", "COMPANY_SITE", true);

    await page.goto("/");
    await page.getByRole("button", { name: /Review draft for SAP Draft Lead/ }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "SAP Draft Lead at Drafting Co" })).toBeVisible();
    await expect(drawer.getByText("Check this: TOGAF.")).toBeVisible();
    await expect(drawer.getByRole("link", { name: /Open application page/ })).toHaveAttribute("href", "https://example.com/apply");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await drawer.getByLabel("Cover letter").fill("Dear Hiring Manager, edited.");
    await drawer.getByLabel("Headline").fill("Edited Headline");
    await drawer.getByRole("button", { name: "Save draft" }).click();
    await expect(drawer.getByRole("status")).toHaveText("Draft saved.");

    const saved = await context.request.get("/api/applications/app-draft-1");
    expect(await saved.json()).toMatchObject({ coverLetter: "Dear Hiring Manager, edited.", tailoredCv: { headline: "Edited Headline" }, status: "DRAFT" });

    const pdf = await context.request.get("/api/applications/app-draft-1/cv");
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("marking as applied records it once and locks the draft", async ({ page, context }) => {
    await addScoredJob("draft-2", "SAP Applied Lead", "COMPANY_SITE", true);

    await page.goto("/");
    await page.getByRole("button", { name: /Review draft for SAP Applied Lead/ }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Mark as applied" }).click();
    await expect(drawer.getByRole("status")).toContainText("Marked as applied");
    await expect(drawer.getByRole("button", { name: "Mark as applied" })).toBeHidden();
    await expect(drawer.getByLabel("Cover letter")).not.toBeEditable();

    expect((await context.request.post("/api/applications/app-draft-2/mark-submitted")).status()).toBe(409);
    expect((await context.request.patch("/api/applications/app-draft-2", { data: { coverLetter: "Changed" } })).status()).toBe(409);

    const history = await withDb(async (client) => (await client.query(`SELECT history FROM jobmatch."Application" WHERE id = 'app-draft-2'`)).rows[0].history);
    expect(history.at(-1)).toMatchObject({ action: "marked-submitted", coverLetter: "Dear Hiring Manager," });
  });

  test("a LinkedIn draft only offers a link and copy buttons", async ({ page }) => {
    await addScoredJob("draft-3", "SAP LinkedIn Lead", "LINKEDIN_EASY_APPLY", true);
    await page.goto("/");
    await page.getByRole("button", { name: /Review draft for SAP LinkedIn Lead/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("never acts on LinkedIn for you")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Copy cover letter" })).toBeVisible();
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden();
  });

  test("selected jobs are prepared together, then walked through one by one", async ({ page }) => {
    await addScoredJob("pick-1", "SAP Pick One", "COMPANY_SITE", false);
    await addScoredJob("pick-2", "SAP Pick Two", "COMPANY_SITE", false);
    await addScoredJob("done-1", "SAP Queue One", "COMPANY_SITE", true);
    await addScoredJob("done-2", "SAP Queue Two", "COMPANY_SITE", true);

    await page.goto("/");
    const sent: string[] = [];
    await page.route("**/api/applications", async (route) => {
      const [jobId] = route.request().postDataJSON().jobIds;
      sent.push(jobId);
      const applicationId = jobId === "pick-1" ? "app-done-1" : "app-done-2";
      await route.fulfill({ json: { results: [{ jobId, status: "created", applicationId }] } });
    });

    await expect(page.getByRole("button", { name: "Prepare drafts for selected (0)" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Select SAP Pick One at Drafting Co" }).check();
    await page.getByRole("checkbox", { name: "Select SAP Pick Two at Drafting Co" }).check();
    await page.getByRole("button", { name: "Prepare drafts for selected (2)" }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText(/Draft \d of 2/)).toBeVisible();
    expect(sent.sort()).toEqual(["pick-1", "pick-2"]);
    await drawer.getByRole("button", { name: "Next draft" }).click();
    await expect(drawer.getByText("Draft 2 of 2")).toBeVisible();
    await drawer.getByRole("button", { name: "Finish" }).click();
    await expect(drawer).toBeHidden();
  });

  test("without an API key, preparing a draft explains what's missing and creates nothing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Prepare draft for SAP Pick One/ }).click();
    await expect(page.getByRole("main").getByRole("status").first()).toContainText("ANTHROPIC_API_KEY");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("sending needs a session and a confirmation, and the scheduler can't do either", async ({ playwright, baseURL, context }) => {
    await addScoredJob("mail-0", "SAP Mail Guard", "EMAIL", true);
    await withDb((client) => client.query(`UPDATE jobmatch."Job" SET "applyEmail" = 'hr@guard.example.com' WHERE id = 'mail-0'`));

    const anonymous = await playwright.request.newContext({ baseURL });
    const headers = { authorization: `Bearer ${TEST_CRON_SECRET}` };
    const data = { confirm: true };
    expect((await anonymous.post("/api/applications/app-mail-0/send", { data })).status()).toBe(401);
    expect((await anonymous.post("/api/applications/app-mail-0/send", { data, headers })).status()).toBe(401);
    expect((await anonymous.post("/api/applications/approve-all", { data: { confirm: true, ids: ["app-mail-0"] }, headers })).status()).toBe(401);
    expect((await anonymous.post("/api/applications/app-mail-0/cancel", { headers })).status()).toBe(401);
    expect((await anonymous.post("/api/applications/process", { headers })).status()).toBe(200);
    await anonymous.dispose();

    expect((await context.request.post("/api/applications/app-mail-0/send", { data: {} })).status()).toBe(400);
    expect((await context.request.post("/api/applications/app-mail-0/send", { data: { confirm: "yes" } })).status()).toBe(400);
    const untouched = await context.request.get("/api/applications/app-mail-0");
    expect(await untouched.json()).toMatchObject({ status: "DRAFT", sendAt: null });
  });

  test("an email draft asks first, waits, locks and can be cancelled", async ({ page, context }) => {
    await addScoredJob("mail-1", "SAP Mail Lead", "EMAIL", true);
    await withDb((client) => client.query(`UPDATE jobmatch."Job" SET "applyEmail" = 'hr@mail.example.com' WHERE id = 'mail-1'`));

    await page.goto("/");
    await page.getByRole("button", { name: /Review draft for SAP Mail Lead/ }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Send application by email" }).click();
    await expect(drawer.getByText(/This emails your cover letter and tailored CV to hr@mail.example.com/)).toBeVisible();
    expect(await (await context.request.get("/api/applications/app-mail-1")).json()).toMatchObject({ sendAt: null });

    await drawer.getByRole("button", { name: "Yes, send it" }).click();
    await expect(drawer.getByText(/Sending in \d+ seconds/)).toBeVisible();
    await expect(drawer.getByLabel("Cover letter")).not.toBeEditable();
    expect((await context.request.patch("/api/applications/app-mail-1", { data: { coverLetter: "Changed" } })).status()).toBe(409);
    expect((await context.request.post("/api/applications/app-mail-1/mark-submitted")).status()).toBe(409);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await drawer.getByRole("button", { name: "Cancel sending" }).click();
    await expect(drawer.getByRole("status")).toHaveText("Cancelled. Nothing was sent.");
    await expect(drawer.getByLabel("Cover letter")).toBeEditable();
    expect(await (await context.request.get("/api/applications/app-mail-1")).json()).toMatchObject({ status: "DRAFT", sendAt: null, submittedAt: null });
  });

  test("Approve all lists who it will email, leaves flagged drafts out and can be cancelled", async ({ page, context }) => {
    await addScoredJob("mail-2", "SAP Approve One", "EMAIL", true);
    await addScoredJob("mail-3", "SAP Approve Flagged", "EMAIL", true);
    await withDb(async (client) => {
      await client.query(`UPDATE jobmatch."Job" SET "applyEmail" = 'hr@approve.example.com' WHERE id IN ('mail-2', 'mail-3')`);
      await client.query(`UPDATE jobmatch."Application" SET "draftWarnings" = '{}' WHERE id IN ('app-mail-2', 'app-mail-1', 'app-mail-0')`);
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Approve all (3)" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Send 3 applications?")).toBeVisible();
    await expect(dialog.getByText("To hr@approve.example.com")).toBeVisible();
    await expect(dialog.getByText("SAP Approve Flagged")).toBeHidden();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await dialog.getByRole("button", { name: "Not yet" }).click();
    expect(await (await context.request.get("/api/applications/app-mail-2")).json()).toMatchObject({ sendAt: null });

    await page.getByRole("button", { name: "Approve all (3)" }).click();
    await page.getByRole("button", { name: "Yes, send them" }).click();
    const waiting = page.getByRole("region", { name: "Waiting to send" });
    await expect(waiting.getByText("SAP Approve One, Drafting Co")).toBeVisible();

    for (const name of ["app-mail-0", "app-mail-1", "app-mail-2"]) {
      expect((await context.request.post(`/api/applications/${name}/cancel`)).status()).toBe(200);
    }
    await page.reload();
    await expect(page.getByRole("region", { name: "Waiting to send" })).toBeHidden();
  });

  test("a job can be saved or dismissed", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Save for later SAP Pick Two/ }).click();
    await expect(page.getByRole("button", { name: /Unsave SAP Pick Two/ })).toBeVisible();

    await page.getByRole("button", { name: /Dismiss SAP Pick Two/ }).click();
    await expect(page.getByRole("heading", { name: "SAP Pick Two" })).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: "SAP Pick One" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SAP Pick Two" })).toBeHidden();
  });

  test("screening answers are saved in Settings and appear in the drawer", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Notice period").fill("1 month");
    await page.getByRole("button", { name: "Save answers" }).click();
    await expect(page.getByText("Answers saved.")).toBeVisible();

    await page.goto("/");
    await page.getByRole("button", { name: /Review draft for SAP Queue One/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("1 month")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Copy notice period" })).toBeVisible();
  });
});
