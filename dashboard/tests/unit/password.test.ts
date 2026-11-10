import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("accepts the right password and refuses others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^pbkdf2\$600000\$/);
    expect(hash).not.toContain("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts each hash, so the same password never hashes the same way twice", async () => {
    expect(await hashPassword("same password here")).not.toBe(await hashPassword("same password here"));
  });

  it("fails closed when no hash is set or it's malformed", async () => {
    expect(await verifyPassword("anything", undefined)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "plain-text-password")).toBe(false);
    expect(await verifyPassword("anything", "pbkdf2$600000$onlysalt")).toBe(false);
  });

  it("reads hashes made with Node's own PBKDF2, as the test server's is", async () => {
    const salt = Buffer.from("fixed-salt-value");
    const hash = `pbkdf2$1000$${salt.toString("base64")}$${pbkdf2Sync("pw-123456789", salt, 1000, 32, "sha256").toString("base64")}`;
    expect(await verifyPassword("pw-123456789", hash)).toBe(true);
  });
});
