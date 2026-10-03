import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password (scrypt)", () => {
  it("gera hash e valida a senha correta", async () => {
    const hash = await hashPassword("Demo@1234");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Demo@1234", hash)).toBe(true);
  });

  it("rejeita senha incorreta", async () => {
    const hash = await hashPassword("Demo@1234");
    expect(await verifyPassword("outra-senha", hash)).toBe(false);
  });

  it("gera hashes distintos para a mesma senha (salt)", async () => {
    const a = await hashPassword("Demo@1234");
    const b = await hashPassword("Demo@1234");
    expect(a).not.toBe(b);
  });

  it("rejeita hash malformado", async () => {
    expect(await verifyPassword("x", "formato-invalido")).toBe(false);
  });
});
