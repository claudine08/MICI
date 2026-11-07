import { describe, expect, it } from "vitest";
import {
  phoneValueSchema,
  updateMemberSchema,
  updateMyPhoneSchema,
} from "@/modules/identity/schemas";

// Validação de telefone E.164 (Fase I3) — canal do WhatsApp notify.

describe("phoneValueSchema (E.164)", () => {
  it("aceita números internacionais válidos", () => {
    expect(phoneValueSchema.safeParse("+5511999999999").success).toBe(true);
    expect(phoneValueSchema.safeParse("+14155552671").success).toBe(true);
    expect(phoneValueSchema.safeParse("  +5511999999999  ").success).toBe(true);
  });

  it("rejeita formatos não E.164", () => {
    for (const value of ["11999999999", "+55 11 99999-9999", "+0123456", "abc", "+5511"]) {
      expect(phoneValueSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("updateMemberSchema", () => {
  it("aceita atualização apenas de phone", () => {
    const parsed = updateMemberSchema.safeParse({ phone: "+5511999999999" });
    expect(parsed.success).toBe(true);
  });

  it("aceita limpar o phone (null)", () => {
    expect(updateMemberSchema.safeParse({ phone: null }).success).toBe(true);
  });

  it("rejeita phone inválido e payload vazio", () => {
    expect(updateMemberSchema.safeParse({ phone: "99999-9999" }).success).toBe(false);
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
  });
});

describe("updateMyPhoneSchema (autoatualização)", () => {
  it("aceita E.164 e null, rejeita vazio e formatos locais", () => {
    expect(updateMyPhoneSchema.safeParse({ phone: "+5511999999999" }).success).toBe(true);
    expect(updateMyPhoneSchema.safeParse({ phone: null }).success).toBe(true);
    expect(updateMyPhoneSchema.safeParse({ phone: "" }).success).toBe(false);
    expect(updateMyPhoneSchema.safeParse({ phone: "(11) 99999-9999" }).success).toBe(false);
  });
});
