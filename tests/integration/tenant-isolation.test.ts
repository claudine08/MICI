import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization, listUserOrganizations } from "@/modules/identity/services";
import { inviteMember, updateMember, removeMember } from "@/modules/identity/members";
import { createCustomRole } from "@/modules/identity/roles";
import {
  findActiveMembership,
  listMembers,
  listRoles,
} from "@/modules/identity/selectors";
import { listAuditEvents } from "@/core/audit";

// Isolamento de tenant (E02-US05, §10) — obrigatório no CI.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string; membershipId: string };
let orgB: { id: string; membershipId: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let userP: string;

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");

  userA = await prisma.user.create({
    data: { email: `admin-a-${suffix}@test.local`, name: "Admin A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `admin-b-${suffix}@test.local`, name: "Admin B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org A ${suffix}`,
    slug: `org-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org B ${suffix}`,
    slug: `org-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const invitedP = await inviteMember({
    organizationId: orgA.id,
    actorId: userA.id,
    actorLabel: userA.email,
    email: `pmo-${suffix}@test.local`,
    roleCodes: ["PMO"],
  });
  userP = invitedP.userId;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("isolamento de tenant — organizações", () => {
  it("usuário só enxerga as próprias organizações", async () => {
    const orgsA = await listUserOrganizations(userA.id);
    expect(orgsA.map((org) => org.organizationId)).toEqual([orgA.id]);

    const orgsB = await listUserOrganizations(userB.id);
    expect(orgsB.map((org) => org.organizationId)).toEqual([orgB.id]);
  });

  it("membership de outro tenant não é encontrada", async () => {
    expect(await findActiveMembership(orgA.id, userA.id)).not.toBeNull();
    expect(await findActiveMembership(orgA.id, userB.id)).toBeNull();
    expect(await findActiveMembership(orgB.id, userA.id)).toBeNull();
  });

  it("listMembers é escopado ao tenant", async () => {
    const membersA = await listMembers(orgA.id);
    const emailsA = membersA.map((member) => member.email);
    expect(emailsA).toContain(userA.email);
    expect(emailsA).not.toContain(userB.email);

    const membersB = await listMembers(orgB.id);
    const emailsB = membersB.map((member) => member.email);
    expect(emailsB).toEqual([userB.email]);
  });
});

describe("isolamento de tenant — comandos", () => {
  it("updateMember não alcança membresia de outro tenant", async () => {
    await expect(
      updateMember({
        organizationId: orgA.id,
        membershipId: orgB.membershipId,
        actorId: userA.id,
        actorLabel: userA.email,
        status: "SUSPENDED",
      })
    ).rejects.toThrowError(AppError);
  });

  it("removeMember não alcança membresia de outro tenant", async () => {
    await expect(
      removeMember({
        organizationId: orgA.id,
        membershipId: orgB.membershipId,
        actorId: userA.id,
        actorLabel: userA.email,
      })
    ).rejects.toThrowError(/não encontrada/i);
  });

  it("bloqueia alteração da própria membresia", async () => {
    await expect(
      updateMember({
        organizationId: orgA.id,
        membershipId: orgA.membershipId,
        actorId: userA.id,
        actorLabel: userA.email,
        roleCodes: ["PMO"],
      })
    ).rejects.toThrowError(/própria membresia/i);
  });

  it("bloqueia suspender o último administrador ativo", async () => {
    await expect(
      updateMember({
        organizationId: orgA.id,
        membershipId: orgA.membershipId,
        actorId: userP,
        actorLabel: "pmo@test.local",
        status: "SUSPENDED",
      })
    ).rejects.toThrowError(/último administrador/i);

    const admin = await prisma.organizationMembership.findUniqueOrThrow({
      where: { id: orgA.membershipId },
    });
    expect(admin.status).toBe("ACTIVE");
  });
});

describe("convite, papéis e remoção", () => {
  it("convite cria usuário com senha temporária válida e membership escopada", async () => {
    const email = `member-${suffix}@test.local`;
    const result = await inviteMember({
      organizationId: orgA.id,
      actorId: userA.id,
      actorLabel: userA.email,
      email,
      roleCodes: ["VIEWER"],
    });

    expect(result.generatedPassword).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await verifyPassword(result.generatedPassword!, user.passwordHash!)).toBe(true);

    expect(await findActiveMembership(orgA.id, user.id)).not.toBeNull();
    expect(await findActiveMembership(orgB.id, user.id)).toBeNull();
  });

  it("atualiza papéis/status da membresia e audita", async () => {
    const email = `promote-${suffix}@test.local`;
    const invited = await inviteMember({
      organizationId: orgA.id,
      actorId: userA.id,
      actorLabel: userA.email,
      email,
      roleCodes: ["VIEWER"],
    });

    const updated = await updateMember({
      organizationId: orgA.id,
      membershipId: invited.membershipId,
      actorId: userA.id,
      actorLabel: userA.email,
      roleCodes: ["PROJECT_MANAGER"],
      status: "SUSPENDED",
    });
    expect(updated.roleCodes).toEqual(["PROJECT_MANAGER"]);
    expect(updated.status).toBe("SUSPENDED");

    const audit = await prisma.auditEvent.findFirst({
      where: { organizationId: orgA.id, objectId: invited.membershipId, action: "UPDATE" },
    });
    expect(audit).not.toBeNull();
  });

  it("remove membros com soft-delete", async () => {
    const email = `remove-${suffix}@test.local`;
    const invited = await inviteMember({
      organizationId: orgA.id,
      actorId: userA.id,
      actorLabel: userA.email,
      email,
      roleCodes: ["VIEWER"],
    });

    await removeMember({
      organizationId: orgA.id,
      membershipId: invited.membershipId,
      actorId: userA.id,
      actorLabel: userA.email,
    });

    expect(await findActiveMembership(orgA.id, invited.userId)).toBeNull();
    const members = await listMembers(orgA.id);
    expect(members.map((member) => member.email)).not.toContain(email);
  });

  it("papel customizado fica restrito à própria organização", async () => {
    const role = await createCustomRole({
      organizationId: orgA.id,
      actorId: userA.id,
      actorLabel: userA.email,
      code: `ANALISTA_${suffix.toUpperCase()}`,
      name: "Analista",
      permissionCodes: ["PROJECT:VIEW", "REPORT:EXPORT"],
    });

    const rolesA = await listRoles(orgA.id);
    const rolesB = await listRoles(orgB.id);
    expect(rolesA.some((item) => item.id === role.id)).toBe(true);
    expect(rolesB.some((item) => item.id === role.id)).toBe(false);
  });

  it("rejeita código de papel duplicado na mesma organização", async () => {
    const code = `DUP_${suffix.toUpperCase()}`;
    await createCustomRole({
      organizationId: orgA.id,
      actorId: userA.id,
      actorLabel: userA.email,
      code,
      name: "Primeiro",
      permissionCodes: ["PROJECT:VIEW"],
    });

    await expect(
      createCustomRole({
        organizationId: orgA.id,
        actorId: userA.id,
        actorLabel: userA.email,
        code,
        name: "Segundo",
        permissionCodes: ["PROJECT:VIEW"],
      })
    ).rejects.toThrowError(/já existe/i);
  });
});

describe("auditoria escopada ao tenant", () => {
  it("eventos de um tenant não aparecem na trilha do outro", async () => {
    const eventB = await prisma.auditEvent.findFirst({
      where: { organizationId: orgB.id },
      orderBy: { createdAt: "desc" },
    });
    expect(eventB).not.toBeNull();

    const trailA = await listAuditEvents({ organizationId: orgA.id, pageSize: 100 });
    expect(trailA.items.map((item) => item.id)).not.toContain(eventB!.id);

    const trailB = await listAuditEvents({ organizationId: orgB.id, pageSize: 100 });
    expect(trailB.items.map((item) => item.id)).toContain(eventB!.id);
  });
});
