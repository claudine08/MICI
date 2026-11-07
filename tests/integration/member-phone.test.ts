import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createOrganization } from "@/modules/identity/services";
import { inviteMember, updateMember } from "@/modules/identity/members";
import { listMembers } from "@/modules/identity/selectors";

// Telefone do usuário (Fase I3): gravado por admin via updateMember e
// exposto em listMembers — habilita o whatsapp.notify.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let org: { id: string };
let admin: { id: string; email: string };
let member: { membershipId: string; userId: string; email: string };

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  admin = await prisma.user.create({
    data: { email: `admin-phone-${suffix}@test.local`, name: "Admin Phone", passwordHash },
  });
  org = await createOrganization({
    name: `Org Phone ${suffix}`,
    slug: `org-phone-${suffix}`,
    actorId: admin.id,
    actorEmail: admin.email,
  });
  const invited = await inviteMember({
    organizationId: org.id,
    actorId: admin.id,
    actorLabel: admin.email,
    email: `member-phone-${suffix}@test.local`,
    roleCodes: ["PMO"],
  });
  member = { membershipId: invited.membershipId, userId: invited.userId, email: invited.email };
});

afterAll(async () => {
  await prisma.$disconnect();
});

function actor() {
  return { organizationId: org.id, actorId: admin.id, actorLabel: admin.email };
}

describe("telefone do membro (User.phone)", () => {
  it("updateMember grava o telefone e listMembers o expõe", async () => {
    await updateMember({
      ...actor(),
      membershipId: member.membershipId,
      phone: "+5511999999999",
    });

    const user = await prisma.user.findUnique({ where: { id: member.userId } });
    expect(user?.phone).toBe("+5511999999999");

    const rows = await listMembers(org.id);
    const row = rows.find((r) => r.userId === member.userId);
    expect(row?.phone).toBe("+5511999999999");
  });

  it("atualização sem phone não altera o telefone existente", async () => {
    await updateMember({
      ...actor(),
      membershipId: member.membershipId,
      status: "ACTIVE",
    });
    const user = await prisma.user.findUnique({ where: { id: member.userId } });
    expect(user?.phone).toBe("+5511999999999");
  });

  it("phone null limpa o telefone", async () => {
    await updateMember({
      ...actor(),
      membershipId: member.membershipId,
      phone: null,
    });
    const user = await prisma.user.findUnique({ where: { id: member.userId } });
    expect(user?.phone).toBeNull();

    const rows = await listMembers(org.id);
    const row = rows.find((r) => r.userId === member.userId);
    expect(row?.phone).toBeNull();
  });
});
