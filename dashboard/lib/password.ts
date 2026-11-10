/**
 * Password hashing with PBKDF2-SHA-256 from Web Crypto, which works in every runtime without an
 * extra package. Stored as "pbkdf2:<iterations>:<salt>:<hash>", with base64 salt and hash. The
 * separator is a colon because a dollar sign in .env.local is read as a reference to another setting.
 */

const ITERATIONS = 600_000;
const KEY_BYTES = 32;

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2:${ITERATIONS}:${toBase64(salt)}:${toBase64(await derive(password, salt, ITERATIONS))}`;
}

/** Fails closed on a missing or malformed hash, and compares without stopping at the first difference. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  // Hashes made before the switch to colons used dollar signs, so both are read.
  const [scheme, iterations, salt, hash] = stored?.trim().split(/[:$]/) ?? [];
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash || !password) return false;
  const expected = fromBase64(hash);
  const actual = await derive(password, fromBase64(salt), Number(iterations));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

export const MIN_PASSWORD_LENGTH = 12;
