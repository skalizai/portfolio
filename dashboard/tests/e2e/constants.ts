// Throwaway values for the local e2e server only.
export const TEST_PORT = 3100;
export const TEST_DB_PORT = 5544;
export const TEST_AUTH_SECRET = "e2e-only-secret-not-used-anywhere-else";
export const TEST_ALLOWED_EMAIL = "owner@example.com";
export const TEST_CRON_SECRET = "e2e-only-cron-secret";
export const TEST_PASSWORD = "e2e-only-password-123";

/** The test password in the dashboard's hash format, with few iterations so tests stay quick. */
export function testPasswordHash(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pbkdf2Sync } = require("node:crypto") as typeof import("node:crypto");
  const salt = Buffer.from("e2e-fixed-salt-16");
  return `pbkdf2:1000:${salt.toString("base64")}:${pbkdf2Sync(TEST_PASSWORD, salt, 1000, 32, "sha256").toString("base64")}`;
}
