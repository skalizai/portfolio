import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Deliver } from "@/lib/apply/send";

const PORT = 5548;
const NOW = new Date(Date.UTC(2026, 10, 5, 12));
const later = (ms: number) => new Date(NOW.getTime() + ms);

const CV = { name: "Test Person", headline: "Lead", summary: "Summary.", contact: [], competencies: [], experience: [], education: [], certifications: [], other: [] };

let server: PGLiteSocketServer;
let pg: PGlite;
let db: typeof import("@/lib/db").db;
let send: typeof import("@/lib/apply/send");

const deliver = vi.fn<Deliver>(async () => ({ messageId: "<id@example.com>" }));

async function addDraft(id: string, overrides: { email?: string | null; channel?: "EMAIL" | "COMPANY_SITE" | "LINKEDIN_EASY_APPLY"; letter?: string | null; warnings?: string[] } = {}) {
  const { email = `jobs@${id}.example.com`, channel = "EMAIL", letter = "Dear Hiring Manager,", warnings = [] } = overrides;
  await db().job.create({
    data: { id, source: "test", sourceJobId: id, title: "SAP Lead", company: `Company ${id}`, description: "x", url: "https://example.com", dedupeHash: id, applyChannel: channel, applyEmail: email },
  });
  await db().application.create({ data: { id, jobId: id, channel, coverLetter: letter, tailoredCv: CV, draftWarnings: warnings } });
}

beforeAll(async () => {
  pg = await PGlite.create();
  const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
  ({ db } = await import("@/lib/db"));
  send = await import("@/lib/apply/send");
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  deliver.mockClear();
  deliver.mockImplementation(async () => ({ messageId: "<id@example.com>" }));
  await pg.exec('TRUNCATE "jobmatch"."Application", "jobmatch"."Job", "jobmatch"."AuditLog", "jobmatch"."SearchConfig" CASCADE');
});

describe("queueApplications", () => {
  it("waits for the undo window, and nothing goes before it ends", async () => {
    await addDraft("a");
    const { queued } = await send.queueApplications(["a"], { now: NOW });
    expect(queued[0]?.sendAt).toEqual(later(send.UNDO_MS));

    expect(await send.processDueSends({ now: later(send.UNDO_MS - 1), deliver })).toMatchObject({ sent: 0, waiting: 1 });
    expect(deliver).not.toHaveBeenCalled();
    expect(await db().application.findUniqueOrThrow({ where: { id: "a" } })).toMatchObject({ status: "READY", submittedAt: null });
  });

  it("can be cancelled during the window, and then never goes", async () => {
    await addDraft("a");
    await send.queueApplications(["a"], { now: NOW });
    expect(await send.cancelSend("a")).toBe(true);

    expect(await send.processDueSends({ now: later(send.UNDO_MS * 10), deliver })).toMatchObject({ sent: 0, waiting: 0 });
    expect(deliver).not.toHaveBeenCalled();
    expect(await db().application.findUniqueOrThrow({ where: { id: "a" } })).toMatchObject({ status: "DRAFT", sendAt: null });
    expect(await send.cancelSend("a")).toBe(false);
  });

  it("spaces emails to one company by 2 minutes, but not those to different companies", async () => {
    await addDraft("a", { email: "hr@acme.example.com" });
    await addDraft("b", { email: "jobs@ACME.example.com" });
    await addDraft("c", { email: "hr@globex.example.com" });

    const { queued } = await send.queueApplications(["a", "b", "c"], { now: NOW });
    const at = Object.fromEntries(queued.map((q) => [q.id, q.sendAt.getTime()]));
    expect(at.a).toBe(later(send.UNDO_MS).getTime());
    expect(at.b! - at.a!).toBe(send.DOMAIN_GAP_MS);
    expect(at.c).toBe(later(send.UNDO_MS).getTime());
  });

  it("keeps the gap with an email already waiting or just sent", async () => {
    await addDraft("a", { email: "hr@acme.example.com" });
    await send.queueApplications(["a"], { now: NOW });
    await send.processDueSends({ now: later(send.UNDO_MS), deliver });

    const sentAt = (await db().application.findUniqueOrThrow({ where: { id: "a" } })).submittedAt!;
    await addDraft("b", { email: "jobs@acme.example.com" });
    const now = new Date(sentAt.getTime() + 1000);
    const { queued } = await send.queueApplications(["b"], { now });
    expect(queued[0]!.sendAt.getTime()).toBe(sentAt.getTime() + send.DOMAIN_GAP_MS);
  });

  it("enforces the daily cap, counting what's already waiting", async () => {
    await db().searchConfig.create({ data: { keywords: [], locations: [], sourcesEnabled: [], dailyApplyCap: 2 } });
    await addDraft("a");
    await addDraft("b");
    await addDraft("c");
    await send.queueApplications(["a"], { now: NOW });

    const { queued, skipped } = await send.queueApplications(["b", "c"], { now: NOW });
    expect(queued.map((q) => q.id)).toEqual(["b"]);
    expect(skipped).toEqual([{ id: "c", reason: expect.stringContaining("limit of 2") }]);
  });

  it("only queues email jobs with a valid address and a complete draft", async () => {
    await addDraft("site", { channel: "COMPANY_SITE", email: null });
    await addDraft("linkedin", { channel: "LINKEDIN_EASY_APPLY", email: "x@linkedin.com" });
    await addDraft("bad", { email: "not-an-address" });
    await addDraft("injected", { email: "a@b.com,victim@c.com" });
    await addDraft("empty", { letter: null });

    const { queued, skipped } = await send.queueApplications(["site", "linkedin", "bad", "injected", "empty", "gone"], { now: NOW });
    expect(queued).toEqual([]);
    expect(skipped).toHaveLength(6);
    expect(await db().application.count({ where: { sendAt: { not: null } } })).toBe(0);
  });

  it("won't queue twice, or after you've applied", async () => {
    await addDraft("a");
    await send.queueApplications(["a"], { now: NOW });
    expect((await send.queueApplications(["a"], { now: NOW })).skipped[0]?.reason).toContain("already waiting");

    await send.processDueSends({ now: later(send.UNDO_MS), deliver });
    expect((await send.queueApplications(["a"], { now: later(send.UNDO_MS * 2) })).skipped[0]?.reason).toContain("already applied");
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("leaves drafts with something to check out of Approve all, but not out of a single send", async () => {
    await addDraft("clean");
    await addDraft("flagged", { warnings: ["Check these: TOGAF."] });

    const all = await send.queueApplications(["clean", "flagged"], { now: NOW, onlyClean: true });
    expect(all.queued.map((q) => q.id)).toEqual(["clean"]);
    expect(all.skipped).toEqual([{ id: "flagged", reason: expect.stringContaining("check") }]);

    expect((await send.queueApplications(["flagged"], { now: NOW })).queued).toHaveLength(1);
  });
});

describe("processDueSends", () => {
  it("sends the letter and CV to the listing's address and records exactly what went", async () => {
    await addDraft("a", { email: "hr@acme.example.com" });
    await send.queueApplications(["a"], { now: NOW });
    expect(await send.processDueSends({ now: later(send.UNDO_MS), deliver })).toMatchObject({ sent: 1, failed: 0, waiting: 0 });

    expect(deliver).toHaveBeenCalledWith({ to: "hr@acme.example.com", subject: "Application — SAP Lead — Test Person", text: "Dear Hiring Manager,", cv: CV });
    const saved = await db().application.findUniqueOrThrow({ where: { id: "a" } });
    expect(saved).toMatchObject({ status: "SUBMITTED", emailMessageId: "<id@example.com>", sendAt: null });
    expect(saved.submittedAt).not.toBeNull();
    expect((saved.history as { action: string }[]).at(-1)).toMatchObject({ action: "sent", to: "hr@acme.example.com", coverLetter: "Dear Hiring Manager,", tailoredCv: CV });
  });

  it("doesn't send twice when two runs overlap", async () => {
    await addDraft("a");
    await send.queueApplications(["a"], { now: NOW });
    await Promise.all([send.processDueSends({ now: later(send.UNDO_MS), deliver }), send.processDueSends({ now: later(send.UNDO_MS), deliver })]);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("returns a failed email to a draft, warns you and doesn't retry by itself", async () => {
    await addDraft("a");
    await send.queueApplications(["a"], { now: NOW });
    deliver.mockRejectedValueOnce(new Error("535 auth failed for secret-password"));

    expect(await send.processDueSends({ now: later(send.UNDO_MS), deliver })).toMatchObject({ sent: 0, failed: 1 });
    const saved = await db().application.findUniqueOrThrow({ where: { id: "a" } });
    expect(saved).toMatchObject({ status: "DRAFT", submittedAt: null, sendAt: null });
    expect(saved.draftWarnings[0]).toContain("nothing went out");
    expect(JSON.stringify(saved)).not.toContain("secret-password");

    await send.processDueSends({ now: later(send.UNDO_MS * 5), deliver });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a draft nobody confirmed", async () => {
    await addDraft("a");
    expect(await send.processDueSends({ now: later(send.UNDO_MS * 100), deliver })).toMatchObject({ sent: 0, waiting: 0 });
    expect(deliver).not.toHaveBeenCalled();
  });
});
