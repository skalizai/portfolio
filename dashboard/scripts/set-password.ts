/**
 * Sets your dashboard password:   npm run auth:set-password
 *
 * Asks for the password twice without showing it, then stores only its hash in .env.local as
 * AUTH_PASSWORD_HASH. The password itself is never written anywhere.
 */
import { readFileSync, writeFileSync } from "node:fs";
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
  console.log("Saved. Only the hash is stored in .env.local, never the password itself.");
}

main();
