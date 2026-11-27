import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PORT = 5553;
const OWNER = "owner@example.com";
const OUTBOX = join(mkdtempSync(join(tmpdir(), "security-")), "outbox.jsonl");

let server: PGLiteSocketServer;
let pg: PGlite;
let db: typeof import("@/lib/db").db;
let codes: typeof import("@/lib/security/codes");
let flows: typeof import("@/lib/security/flows");
let credentials: typeof import("@/lib/security/credentials");
let password: typeof import("@/lib/password");
let email: typeof import("@/lib/security/email");

beforeAll(async () => {
  pg = await PGlite.create();
  const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
  process.env.AUTH_ALLOWED_EMAIL = OWNER;
  process.env.RESEND_API_KEY = "";
  process.env.SECURITY_EMAIL_OUTBOX = OUTBOX;
  ({ db } = await import("@/lib/db"));
  codes = await import("@/lib/security/codes");
  flows = await import("@/lib/security/flows");
  credentials = await import("@/lib/security/credentials");
  password = await import("@/lib/password");
  email = await import("@/lib/security/email");
  process.env.AUTH_PASSWORD_HASH = await password.hashPassword("the-old-password-1");
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('TRUNCATE "jobmatch"."Credential", "jobmatch"."VerificationCode", "jobmatch"."AuditLog"');
  writeFileSync(OUTBOX, "");
});

const sent = () =>
  readFileSync(OUTBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { to: string; subject: string; text: string });
const lastCode = () => sent().at(-1)!.subject.match(/(\d{6})$/)![1]!;

describe("emailed codes", () => {
  it("allow five tries, one use, and one request a minute", async () => {
    const now = new Date("2026-11-27T10:00:00Z");
    const issued = await codes.issueCode("reset-password", null, now);
    if (!issued.ok) throw new Error(issued.error);
    expect(await codes.issueCode("reset-password", null, new Date(now.getTime() + 30_000))).toMatchObject({ ok: false, status: 429 });

    const wrong = issued.code === "000000" ? "111111" : "000000";
    expect(await codes.checkCode("reset-password", wrong, now)).toMatchObject({ ok: false, error: "That code isn't right. 4 tries left." });
    expect((await codes.checkCode("reset-password", issued.code, now)).ok).toBe(true);
    expect(await codes.checkCode("reset-password", issued.code, now)).toMatchObject({ ok: false, error: expect.stringContaining("expired") });
  });

  it("expire after 10 minutes, after five wrong tries, and when a newer one is sent", async () => {
    const now = new Date("2026-11-27T10:00:00Z");
    const first = await codes.issueCode("change-password", null, now);
    if (!first.ok) throw new Error(first.error);
    expect((await codes.checkCode("change-password", first.code, new Date(now.getTime() + 11 * 60_000))).ok).toBe(false);

    const second = await codes.issueCode("change-password", null, new Date(now.getTime() + 61_000));
    if (!second.ok) throw new Error(second.error);
    const third = await codes.issueCode("change-password", null, new Date(now.getTime() + 122_000));
    if (!third.ok) throw new Error(third.error);
    expect((await codes.checkCode("change-password", second.code === third.code ? "x" : second.code, new Date(now.getTime() + 130_000))).ok).toBe(false);

    const wrong = third.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await codes.checkCode("change-password", wrong, new Date(now.getTime() + 130_000));
    expect((await codes.checkCode("change-password", third.code, new Date(now.getTime() + 130_000))).ok).toBe(false);
  });
});

describe("changing the password", () => {
  it("checks the current one, emails a code to your primary email, then saves and ends every session", async () => {
    expect(await flows.startPasswordChange("wrong", "a-brand-new-password")).toMatchObject({ ok: false, error: "Your current password isn't right." });
    expect(await flows.startPasswordChange("the-old-password-1", "short")).toMatchObject({ ok: false, status: 400 });
    expect(await flows.startPasswordChange("the-old-password-1", "the-old-password-1")).toMatchObject({ ok: false, status: 400 });
    expect(sent()).toHaveLength(0);

    const started = await flows.startPasswordChange("the-old-password-1", "a-brand-new-password");
    expect(started).toEqual({ ok: true, sentTo: "o•••r@example.com" });
    expect(sent()[0]!.to).toBe(OWNER);
    expect(sent()[0]!.text).not.toContain("a-brand-new-password");

    const oldSession = Date.now() - 1000;
    expect(await credentials.isSessionCurrent(oldSession)).toBe(true);
    expect(await flows.confirmPasswordChange(lastCode())).toEqual({ ok: true });
    expect(await password.verifyPassword("a-brand-new-password", await credentials.currentPasswordHash())).toBe(true);
    expect(await password.verifyPassword("the-old-password-1", await credentials.currentPasswordHash())).toBe(false);
    expect(await credentials.isSessionCurrent(oldSession)).toBe(false);
    expect(await credentials.isSessionCurrent(Date.now() + 1)).toBe(true);
    expect(sent().at(-1)!.subject).toBe("Your dashboard password was changed");
  });

  it("stops after five wrong current passwords", async () => {
    for (let i = 0; i < 5; i++) await flows.startPasswordChange("wrong", "a-brand-new-password");
    expect(await flows.startPasswordChange("the-old-password-1", "a-brand-new-password")).toMatchObject({ ok: false, status: 429 });
  });
});

describe("resetting a forgotten password", () => {
  it("only emails the right address, and answers the same either way", async () => {
    expect(await flows.startPasswordReset("someone@example.com")).toEqual({ ok: true });
    expect(sent()).toHaveLength(0);
    expect(await flows.startPasswordReset(" Owner@Example.com ")).toEqual({ ok: true });
    expect(sent()).toHaveLength(1);

    expect(await flows.confirmPasswordReset("someone@example.com", lastCode(), "a-reset-password-22")).toMatchObject({ ok: false });
    expect(await flows.confirmPasswordReset(OWNER, lastCode(), "short")).toMatchObject({ ok: false, status: 400 });
    expect(await flows.confirmPasswordReset(OWNER, lastCode(), "a-reset-password-22")).toEqual({ ok: true });
    expect(await password.verifyPassword("a-reset-password-22", await credentials.currentPasswordHash())).toBe(true);
    expect(await db().auditLog.count({ where: { action: "auth.password_reset" } })).toBe(1);
  });

  it("signing out everywhere ends older sessions", async () => {
    const before = Date.now() - 1000;
    await flows.endAllSessions();
    expect(await credentials.isSessionCurrent(before)).toBe(false);
    expect(await credentials.isSessionCurrent(undefined)).toBe(false);
    expect((await flows.recentActivity()).map((a) => a.label)).toEqual(["Signed out everywhere"]);
  });
});

describe("maskEmail", () => {
  it("hides most of the name", () => {
    expect(email.maskEmail("alizai_sap@example.com")).toBe("a••••••p@example.com");
    expect(email.maskEmail("ab@x.com")).toBe("a@x.com");
    expect(email.maskEmail(null)).toBe("–");
  });
});
