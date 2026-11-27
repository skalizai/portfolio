/**
 * Sets your dashboard password from the terminal:   npm run auth:set-password
 * (The Security page in the dashboard does the same with an emailed code.)
 *
 * Asks for the password twice without showing it, then saves only its hash: in the database used by
 * DATABASE_URL, which the live site reads, and in .env.local as AUTH_PASSWORD_HASH for a fresh setup.
 * Every device is signed out. The password itself is never written anywhere.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../lib/password";

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    // A paste can arrive as several characters at once, so each one is handled in turn.
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") process.exit(1);
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const password = await ask("New dashboard password: ");
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Please use at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }
  if ((await ask("Type it again: ")) !== password) {
    console.error("The two didn't match. Nothing was changed.");
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const file = ".env.local";
  const current = readFileSync(file, "utf8");
  const line = `AUTH_PASSWORD_HASH=${hash}`;
  const next = /^AUTH_PASSWORD_HASH=.*$/m.test(current) ? current.replace(/^AUTH_PASSWORD_HASH=.*$/m, () => line) : `${current.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(file, next);

  config({ path: ".env.local", quiet: true });
  const { db } = await import("../lib/db");
  const { savePasswordHash } = await import("../lib/security/credentials");
  await savePasswordHash(hash);
  await db().auditLog.create({ data: { action: "auth.password_changed", payload: { from: "terminal" } } });
  await db().$disconnect();
  console.log("Saved, and every device is signed out. Only the hash is stored, never the password itself.");
}

main();
