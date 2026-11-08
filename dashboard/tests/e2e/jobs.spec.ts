import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET, TEST_DB_PORT } from "./constants";

const COOKIE = "authjs.session-token";

async function signIn(context: BrowserContext) {
  const value = await encode({ token: { email: TEST_ALLOWED_EMAIL }, secret: TEST_AUTH_SECRET, salt: COOKIE });
  await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function addJob(id: string, title: string, company: string, channel: string, score: number | null) {
  const client = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres?sslmode=disable` });
  await client.connect();
  await client.query(
    `INSERT INTO jobmatch."Job" (id, source, "sourceJobId", title, company, location, description, url, "applyChannel", "dedupeHash", "postedAt", "fetchedAt")
     VALUES ($1, 'test', $1, $2, $3, 'Dubai', 'A job.', 'https://example.com/job', $4::jobmatch."ApplyChannel", $1, now(), now())`,
    [id, title, company, channel],
  );
  if (score !== null) {
    await client.query(
      `INSERT INTO jobmatch."MatchScore" (id, "jobId", score, verdict, "matchedSkills", "missingSkills", "keyRequirements", "redFlags", "seniorityFit", "locationFit", reasoning, "modelVersion", "profileUpdatedAt")
       VALUES ($1, $1, $2, $3::jobmatch."Verdict", '{SAP CPI}', '{RAP}', '{}', '{}', 'fit', true, 'Reason for this score.', 'test', now())`,
      [id, score, score >= 70 ? "GOOD" : "WEAK"],
    );
  }
  await client.end();
}

test.describe.serial("search settings and jobs", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test("search settings need a session and at least one entry", async ({ playwright, baseURL, context }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.put("/api/settings/search", { data: {} })).status()).toBe(401);
    await anonymous.dispose();

    const empty = await context.request.put("/api/settings/search", { data: { keywords: [" "], locations: ["Dubai"] } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error).toContain("Keywords");
  });

  test("keywords and countries are saved without repeats", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel(/Keywords/).fill("SAP CPI\nsap cpi\nSAP BTP");
    await page.getByLabel(/Countries and cities/).fill("Oman\nQatar");
    await expect(page.getByText("That makes 4 searches")).toBeVisible();
    await page.getByLabel(/Minimum score/).fill("75");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/Keywords/)).toHaveValue("SAP CPI\nSAP BTP");
    await expect(page.getByLabel(/Countries and cities/)).toHaveValue("Oman\nQatar");
    await expect(page.getByLabel(/Minimum score/)).toHaveValue("75");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("jobs are listed, can be filtered, and link out without applying", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await addJob("job-1", "SAP CPI Architect", "Acme", "COMPANY_SITE", 90);
    await addJob("job-2", "SAP BTP Lead", "Globex", "EMAIL", 80);
    await addJob("job-3", "SAP FICO Consultant", "Initech", "COMPANY_SITE", 50);
    await addJob("job-4", "SAP Basis Lead", "Umbrella", "COMPANY_SITE", null);

    await page.goto("/matches");
    await expect(page.getByRole("heading", { name: "SAP CPI Architect" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SAP BTP Lead" })).toBeVisible();
    await expect(page.getByText("Reason for this score.").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "SAP FICO Consultant" })).toBeHidden();
    await page.getByText("Below your minimum score (1)").click();
    await expect(page.getByRole("heading", { name: "SAP FICO Consultant" })).toBeVisible();
    await page.getByText("Waiting to be scored (1)").click();
    await expect(page.getByRole("heading", { name: "SAP Basis Lead" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.getByLabel(/Search title/).fill("globex");
    await expect(page.getByRole("heading", { name: "SAP CPI Architect" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "SAP BTP Lead" })).toBeVisible();

    await page.getByLabel(/Search title/).fill("");
    await page.getByLabel("How to apply").selectOption("COMPANY_SITE");
    await expect(page.getByRole("heading", { name: "SAP BTP Lead" })).toBeHidden();

    await page.getByLabel("How to apply").selectOption("");
    const link = page.getByRole("link", { name: /Open listing for SAP CPI Architect/ });
    await expect(link).toHaveAttribute("href", "https://example.com/job");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("refresh reports the outcome", async ({ page }) => {
    await page.goto("/matches");
    await page.route("**/api/jobs/fetch", (route) =>
      route.fulfill({
        json: {
          inserted: 3,
          duplicates: 0,
          durationMs: 1,
          sources: { jsearch: { requests: 1, queries: [], fetched: 3, skipped: 0, errors: [] } },
        },
      }),
    );
    await page.route("**/api/jobs/score", (route) =>
      route.fulfill({ json: { scored: 2, ruledOut: 1, remaining: 0, more: false, capReached: false, inputTokens: 1, outputTokens: 1, errors: [] } }),
    );
    await page.getByRole("button", { name: "Refresh now" }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText("Found 3 new jobs. Scored 2 jobs.");
  });
});
