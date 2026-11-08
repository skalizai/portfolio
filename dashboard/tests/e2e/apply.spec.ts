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

    const headers = { authorization: `Bearer ${TEST_CRON_SECRET}` };
    expect((await anonymous.post("/api/applications", { headers, data: { jobIds: ["x"] } })).status()).toBe(401);
    expect((await anonymous.get("/api/applications/x", { headers })).status()).toBe(401);
    expect((await anonymous.post("/api/applications/x/mark-submitted", { headers })).status()).toBe(401);
    await anonymous.dispose();
  });

  test("a draft can be reviewed and edited, and downloads as a real PDF", async ({ page, context }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await addScoredJob("draft-1", "SAP Draft Lead", "COMPANY_SITE", true);

    await page.goto("/matches");
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

  test("each job shows its own email, score and downloadable cover letter", async ({ page, context }) => {
    await addScoredJob("card-1", "SAP Card Email", "EMAIL", true);
    await addScoredJob("card-2", "SAP Card None", "COMPANY_SITE", false);
    await withDb((client) => client.query(`UPDATE jobmatch."Job" SET "applyEmail" = 'hr@card.example.com', description = 'Email your resume to hr@card.example.com today.' WHERE id = 'card-1'`));

    await page.goto("/matches");
    const withEmail = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "SAP Card Email" }) });
    const email = withEmail.getByRole("link", { name: "hr@card.example.com" });
    await expect(email).toHaveAttribute("href", /^mailto:hr@card\.example\.com\?subject=Application/);
    await expect(email).toHaveAttribute("href", /SAP%20Card%20Email/);
    await expect(withEmail.getByText("Email your resume to hr@card.example.com today.")).toBeVisible();
    await expect(withEmail.getByText("99", { exact: true })).toBeVisible();

    const none = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "SAP Card None" }) });
    await expect(none.getByText("No email to apply to in this listing")).toBeVisible();
    await expect(none.getByRole("link", { name: /Download cover letter/ })).toBeHidden();

    await expect(withEmail.getByRole("link", { name: /Download CV/ })).toHaveAttribute("href", "/api/applications/app-card-1/cv");
    await expect(withEmail.getByRole("link", { name: /Download cover letter/ })).toHaveAttribute("href", "/api/applications/app-card-1/letter");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const letter = await context.request.get("/api/applications/app-card-1/letter");
    expect(letter.status()).toBe(200);
    expect(letter.headers()["content-type"]).toBe("application/pdf");
    expect(letter.headers()["content-disposition"]).toContain("Cover Letter - Test Person - Drafting Co.pdf");
    expect((await letter.body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("a cover letter needs a session and an actual letter", async ({ playwright, baseURL, context }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.get("/api/applications/app-card-1/letter")).status()).toBe(401);
    await anonymous.dispose();
    expect((await context.request.get("/api/applications/nope/letter")).status()).toBe(404);
  });

  test("marking as applied records it once and locks the draft", async ({ page, context }) => {
    await addScoredJob("draft-2", "SAP Applied Lead", "COMPANY_SITE", true);

    await page.goto("/matches");
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
    await page.goto("/matches");
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

    await page.goto("/matches");
    const sent: string[] = [];
    await page.route("**/api/applications", async (route) => {
      const [jobId] = route.request().postDataJSON().jobIds;
      sent.push(jobId);
      const applicationId = jobId === "pick-1" ? "app-done-1" : "app-done-2";
      await route.fulfill({ json: { results: [{ jobId, status: "created", applicationId }] } });
    });

    await expect(page.getByRole("button", { name: "Prepare cover letters for selected (0)" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Select SAP Pick One at Drafting Co" }).check();
    await page.getByRole("checkbox", { name: "Select SAP Pick Two at Drafting Co" }).check();
    await page.getByRole("button", { name: "Prepare cover letters for selected (2)" }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText(/Draft \d of 2/)).toBeVisible();
    expect(sent.sort()).toEqual(["pick-1", "pick-2"]);
    await drawer.getByRole("button", { name: "Next draft" }).click();
    await expect(drawer.getByText("Draft 2 of 2")).toBeVisible();
    await drawer.getByRole("button", { name: "Finish" }).click();
    await expect(drawer).toBeHidden();
  });

  test("without an API key, preparing a draft explains what's missing and creates nothing", async ({ page }) => {
    await page.goto("/matches");
    await page.getByRole("button", { name: /Prepare cover letter for SAP Pick One/ }).click();
    await expect(page.getByRole("main").getByRole("status").first()).toContainText("ANTHROPIC_API_KEY");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("the dashboard never sends an application, even with email set up", async ({ page, playwright, baseURL, context }) => {
    await addScoredJob("mail-1", "SAP Mail Lead", "EMAIL", true);
    await withDb((client) => client.query(`UPDATE jobmatch."Job" SET "applyEmail" = 'hr@mail.example.com', description = 'Email your CV to hr@mail.example.com' WHERE id = 'mail-1'`));

    await page.goto("/matches");
    await expect(page.getByRole("button", { name: /Approve all/ })).toBeHidden();
    await page.getByRole("button", { name: /Review draft for SAP Mail Lead/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("hr@mail.example.com", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Download cover letter as PDF" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: /Send/ })).toHaveCount(0);

    for (const path of ["/api/applications/app-mail-1/send", "/api/applications/approve-all", "/api/applications/app-mail-1/cancel", "/api/applications/process"]) {
      // Gone, or caught by the draft route, which has no way to send.
      expect([404, 405]).toContain((await context.request.post(path, { data: { confirm: true, ids: ["app-mail-1"] } })).status());
    }

    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.post("/api/notify/digest")).status()).toBe(401);
    await anonymous.dispose();
  });

  test("a job can be saved or dismissed", async ({ page }) => {
    await page.goto("/matches");
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

    await page.goto("/matches");
    await page.getByRole("button", { name: /Review draft for SAP Queue One/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("1 month")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Copy notice period" })).toBeVisible();
  });
});
