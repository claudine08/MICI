import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

// Hash de senha com scrypt (nativo do Node — sem dependência proprietária).
// Formato: scrypt$<salt_hex>$<hash_hex> — N=16384 (default do Node).

const KEY_LENGTH = 64;

function deriveKey(plain: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(plain, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await deriveKey(plain, salt);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, salt, expectedHex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;

  const derived = await deriveKey(plain, salt);
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}
