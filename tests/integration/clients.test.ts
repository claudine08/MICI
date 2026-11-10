// Clientes do portfólio (E03-US02): cadastro com código automático sequencial.
// Estados reais em Postgres + isolamento de tenant.

import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createClient, deleteClient } from "@/modules/portfolio/clients";
import { listClients } from "@/modules/portfolio/selectors";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Esperava AppError "${code}", mas a operação concluiu.`);
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `cli-a-${suffix}@test.local`, name: "Client A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `cli-b-${suffix}@test.local`, name: "Client B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Client A ${suffix}`,
    slug: `cli-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Client B ${suffix}`,
    slug: `cli-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });
});

describe("Clients Integration (E03)", () => {
  it("gera código sequencial CLI001 ao criar cliente sem código", async () => {
    const client = await createClient({
      ...actorA(),
      name: "Lusos Restaurante",
    });

    expect(client.id).toBeDefined();
    expect(client.code).toBe("CLI001");
    expect(client.name).toBe("Lusos Restaurante");
  });

  it("gera CLI002 na segunda criação sem código", async () => {
    const client = await createClient({
      ...actorA(),
      name: "Outro Cliente",
    });

    expect(client.code).toBe("CLI002");
  });

  it("respeita código manual informado", async () => {
    const client = await createClient({
      ...actorA(),
      code: "CLI-CUSTOM",
      name: "Cliente com código manual",
    });

    expect(client.code).toBe("CLI-CUSTOM");
  });

  it("rejeita código duplicado na mesma organização", async () => {
    await expectAppError(
      createClient({
        ...actorA(),
        code: "CLI-CUSTOM",
        name: "Duplicado",
      }),
      "CONFLICT"
    );
  });

  it("respeita isolamento de tenant entre organizações", async () => {
    const listA = await listClients(orgA.id);
    expect(listA.length).toBeGreaterThanOrEqual(3);

    const listB = await listClients(orgB.id);
    expect(listB.length).toBe(0);
  });

  it("soft delete remove cliente da listagem", async () => {
    const client = await createClient({
      ...actorA(),
      name: "Cliente para remover",
    });
    await deleteClient({ ...actorA(), clientId: client.id });

    const list = await listClients(orgA.id);
    expect(list.find((c) => c.id === client.id)).toBeUndefined();
  });
});
