import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { inviteMember, removeMember } from "@/modules/identity/members";

// Regressão do 500 em produção (07/11): reconvite de membro removido batia na
// unique (organization_id, user_id) porque a membresia soft-deleteada era
// ignorada pelo check e o create falhava. Agora a membresia é reativada.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let org: { id: string };
let admin: { id: string; email: string };
const memberEmail = `reinvite-${suffix}@test.local`;

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  admin = await prisma.user.create({
    data: { email: `admin-reinvite-${suffix}@test.local`, name: "Admin Reinvite", passwordHash },
  });
  org = await createOrganization({
    name: `Org Reinvite ${suffix}`,
    slug: `org-reinvite-${suffix}`,
    actorId: admin.id,
    actorEmail: admin.email,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function actor() {
  return { organizationId: org.id, actorId: admin.id, actorLabel: admin.email };
}

describe("reconvite após remoção (soft-delete)", () => {
  it("convida, remove e reconvite reativa a mesma membresia sem erro", async () => {
    const first = await inviteMember({
      ...actor(),
      email: memberEmail,
      roleCodes: ["PMO"],
    });

    await removeMember({ ...actor(), membershipId: first.membershipId });

    const reinvited = await inviteMember({
      ...actor(),
      email: memberEmail,
      roleCodes: ["PMO", "VIEWER"],
    });

    // Reativa a linha existente (unique org+user) em vez de criar outra.
    expect(reinvited.membershipId).toBe(first.membershipId);
    expect(reinvited.userId).toBe(first.userId);

    const membership = await prisma.organizationMembership.findUnique({
      where: { id: first.membershipId },
      include: { roles: { include: { role: true } } },
    });
    expect(membership?.deletedAt).toBeNull();
    expect(membership?.status).toBe("ACTIVE");
    expect(membership?.roles.map((r) => r.role.code).sort()).toEqual(["PMO", "VIEWER"]);
  });

  it("convite duplicado de membro ATIVO continua dando CONFLICT", async () => {
    await expect(
      inviteMember({ ...actor(), email: memberEmail, roleCodes: ["PMO"] })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      inviteMember({ ...actor(), email: memberEmail, roleCodes: ["PMO"] })
    ).rejects.toBeInstanceOf(AppError);
  });
});
