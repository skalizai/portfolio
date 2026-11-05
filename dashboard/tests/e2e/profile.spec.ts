import { expect, test, type BrowserContext } from "@playwright/test";
import JSZip from "jszip";
import { encode } from "next-auth/jwt";
import { TEST_ALLOWED_EMAIL, TEST_AUTH_SECRET } from "./constants";

const COOKIE = "authjs.session-token";

async function signIn(context: BrowserContext) {
  const value = await encode({ token: { email: TEST_ALLOWED_EMAIL }, secret: TEST_AUTH_SECRET, salt: COOKIE });
  await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}

/** A one-page PDF containing a known sentence, built here so no real CV is involved. */
function minimalPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = body.length;
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

/** A minimal Word document containing a known sentence. */
async function minimalDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

test.describe.serial("profile", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test("saving requires a session and a valid profile", async ({ playwright, baseURL, context }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.put("/api/profile", { data: {} })).status()).toBe(401);
    expect((await anonymous.post("/api/profile/cv", { data: { text: "x" } })).status()).toBe(401);
    await anonymous.dispose();

    expect((await context.request.put("/api/profile", { data: { profile: { name: "" } } })).status()).toBe(400);
  });

  test("edits are saved and survive a reload", async ({ page }) => {
    await page.goto("/profile");
    await page.getByLabel("Name", { exact: true }).fill("Test Person");
    await page.getByLabel(/Core skills/).fill("SAP CPI\nBTP");
    await page.getByLabel(/Target job titles/).fill("SAP Lead");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText("Profile saved.");

    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Test Person");
    await expect(page.getByLabel(/Core skills/)).toHaveValue("SAP CPI\nBTP");
  });

  test("a saving error is shown without losing the edit", async ({ page }) => {
    await page.goto("/profile");
    await page.getByLabel("Name", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText("Name is required");
    await expect(page.getByLabel(/Core skills/)).toHaveValue("SAP CPI\nBTP");
  });

  test("without an API key the CV step explains what's missing", async ({ page }) => {
    await page.goto("/profile");
    await page.getByLabel("CV (PDF or Word)").setInputFiles({
      name: "cv.pdf",
      mimeType: "application/pdf",
      buffer: minimalPdf("Sample CV text"),
    });
    await expect(page.getByRole("status")).toContainText("ANTHROPIC_API_KEY");
  });

  test("a file that isn't a PDF gets a clear error", async ({ page }) => {
    await page.goto("/profile");
    await page.getByLabel("CV (PDF or Word)").setInputFiles({
      name: "cv.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("not a pdf"),
    });
    await expect(page.getByRole("status")).toHaveText("That file couldn't be read as a PDF.");
  });

  test("a Word CV's text is read in the browser and only the text is sent", async ({ page }) => {
    let sentText = "";
    await page.route("**/api/profile/cv", async (route) => {
      sentText = route.request().postDataJSON().text;
      await route.fulfill({ json: { proposed: {}, changes: [] } });
    });

    await page.goto("/profile");
    await page.getByLabel("CV (PDF or Word)").setInputFiles({
      name: "cv.docx",
      mimeType: DOCX_TYPE,
      buffer: await minimalDocx("Sample Word CV text"),
    });
    await expect.poll(() => sentText).toBe("Sample Word CV text");
  });

  test("a CV that changes nothing in the profile is still saved", async ({ page }) => {
    await page.route("**/api/profile/cv", (route) => route.fulfill({ json: { proposed: { name: "Test Person", headline: "", location: "", yearsExperience: 0, currentRole: "", leadership: "", contact: { email: "", phone: "", linkedinUrl: "", portfolioUrl: "" }, coreSkills: [], modules: [], industries: [], certifications: [], targetTitles: [], preferences: { locations: [], workModes: [], employmentTypes: [], minSeniority: "", excludeKeywords: [], salaryFloorAED: null, visaSponsorshipLocations: [] } }, changes: [] } }));

    await page.goto("/profile");
    await page.getByLabel("CV (PDF or Word)").setInputFiles({ name: "cv.docx", mimeType: DOCX_TYPE, buffer: await minimalDocx("Unchanged CV") });
    await expect(page.getByText("doesn't change anything in your profile")).toBeVisible();

    let saved: unknown = null;
    await page.route("**/api/profile", async (route) => {
      saved = route.request().postDataJSON().cvText;
      await route.fulfill({ json: { updatedAt: new Date().toISOString() } });
    });
    await page.getByRole("button", { name: "Save new CV and selected changes" }).click();
    await expect(page.getByRole("status")).toHaveText("New CV and profile saved.");
    expect(saved).toBe("Unchanged CV");
  });

  test("unreadable and unsupported files get a clear error", async ({ page }) => {
    await page.goto("/profile");
    const upload = page.getByLabel("CV (PDF or Word)");

    await upload.setInputFiles({ name: "cv.docx", mimeType: DOCX_TYPE, buffer: Buffer.from("not a zip") });
    await expect(page.getByRole("status")).toHaveText("That file couldn't be read as a Word document.");

    await upload.setInputFiles({ name: "cv.doc", mimeType: "application/msword", buffer: Buffer.from("old") });
    await expect(page.getByRole("status")).toContainText("Older .doc files can't be read");

    await upload.setInputFiles({ name: "cv.txt", mimeType: "text/plain", buffer: Buffer.from("text") });
    await expect(page.getByRole("status")).toHaveText("Please choose a PDF or Word (.docx) file.");
  });

  test("a new CV shows its changes and saves only the ones selected", async ({ page }) => {
    let sentText = "";
    await page.route("**/api/profile/cv", async (route) => {
      sentText = route.request().postDataJSON().text;
      const proposed = {
        headline: "Integration Lead",
        coreSkills: ["SAP CPI", "ABAP"],
      };
      await route.fulfill({
        json: {
          proposed: { ...proposed },
          changes: [
            { id: "coreSkills.add", kind: "list-add", label: "Core skills", field: "coreSkills", items: ["ABAP"], recommended: true },
            { id: "coreSkills.remove", kind: "list-remove", label: "Core skills", field: "coreSkills", items: ["BTP"], recommended: false },
          ],
        },
      });
    });

    await page.goto("/profile");
    await page.getByLabel("CV (PDF or Word)").setInputFiles({
      name: "cv.pdf",
      mimeType: "application/pdf",
      buffer: minimalPdf("Sample CV text"),
    });

    await expect(page.getByRole("checkbox", { name: /Add: ABAP/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Remove: BTP/ })).not.toBeChecked();
    expect(sentText).toContain("Sample CV text");

    // The other save button doesn't store a CV, so it can't be used by mistake here.
    await expect(page.getByRole("button", { name: "Save profile" })).toBeDisabled();
    await expect(page.getByText("Save or discard the new CV")).toBeVisible();

    await page.getByRole("button", { name: "Save new CV and selected changes" }).click();
    await expect(page.getByRole("status")).toHaveText("New CV and profile saved.");
    await expect(page.getByRole("button", { name: "Save profile" })).toBeEnabled();

    await page.reload();
    await expect(page.getByLabel(/Core skills/)).toHaveValue("SAP CPI\nBTP\nABAP");
  });
});
