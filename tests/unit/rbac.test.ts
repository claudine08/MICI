import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  MODULES,
  ROLE_CODES,
  ROLE_GRANTS,
  can,
  allPermissionCodes,
  expandRolePermissions,
  permissionCode,
  toPermissionSet,
} from "@/core/rbac";

describe("rbac", () => {
  it("expande ADMIN para todas as permissões", () => {
    const codes = expandRolePermissions("ADMIN");
    const expected = MODULES.length * ACTIONS.length;
    expect(codes).toHaveLength(expected);
    expect(codes).toContain("PROJECT:ADMIN");
    expect(codes).toContain("AUDIT:EXPORT");
  });

  it("VIEWER só enxerga (VIEW) em todos os módulos", () => {
    const codes = expandRolePermissions("VIEWER");
    expect(codes).toHaveLength(MODULES.length);
    expect(codes.every((code) => code.endsWith(":VIEW"))).toBe(true);
    expect(codes).not.toContain("PROJECT:DELETE");
  });

  it("AUDITOR tem VIEW e EXPORT apenas", () => {
    const codes = expandRolePermissions("AUDITOR");
    expect(codes).toHaveLength(MODULES.length * 2);
    expect(codes).toContain("AUDIT:EXPORT");
    expect(codes).not.toContain("AUDIT:DELETE");
  });

  it("can() valida por código de permissão", () => {
    const permissions = toPermissionSet(["PROJECT:VIEW", "GATE:APPROVE"]);
    expect(can(permissions, "PROJECT", "VIEW")).toBe(true);
    expect(can(permissions, "GATE", "APPROVE")).toBe(true);
    expect(can(permissions, "PROJECT", "DELETE")).toBe(false);
  });

  it("can() aceita fonte como array", () => {
    expect(can(["COST:EDIT"], "COST", "EDIT")).toBe(true);
    expect(can(["COST:EDIT"], "COST", "DELETE")).toBe(false);
  });

  it("toda entrada da matriz referencia grants válidos", () => {
    for (const role of ROLE_CODES) {
      expect(ROLE_GRANTS[role].length).toBeGreaterThan(0);
      expect(expandRolePermissions(role).length).toBeGreaterThan(0);
    }
  });

  it("catálogo completo tem 25 módulos × 8 ações", () => {
    expect(allPermissionCodes()).toHaveLength(25 * 8);
    expect(permissionCode("PROJECT", "VIEW")).toBe("PROJECT:VIEW");
  });
});
