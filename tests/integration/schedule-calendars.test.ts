import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { can, toPermissionSet } from "@/core/rbac";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { createActivity, updateActivity } from "@/modules/schedule/activities";
import {
  listCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
} from "@/modules/schedule/calendars";
import { listActivities } from "@/modules/schedule/selectors";
import { recalculateSchedule } from "@/modules/schedule/cpm";

// Calendários (E07-US03, §27): CRUD por escopo, default por escopo, CPM com
// default (projeto vence organização) e atividade vinculada.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let activityId: string;
let linkedActivityId: string;
let linkedCalendarId: string;
let projectDefaultId: string;

function actorA() {
  return {
    organizationId: orgA.id,
    actorId: userA.id,
    actorLabel: userA.email,
  };
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
    data: { email: `cal-a-${suffix}@test.local`, name: "Calendar A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `cal-b-${suffix}@test.local`, name: "Calendar B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Calendar A ${suffix}`,
    slug: `cal-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Calendar B ${suffix}`,
    slug: `cal-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Calendários",
  });
  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Calendários",
    clientId: client.id,
    status: "ACTIVE",
    startDate: "2026-01-05",
  });
  projectId = project.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("CRUD e validação (E07-US03)", () => {
  it("cria calendário de projeto e lista no contexto do projeto", async () => {
    const calendar = await createCalendar({
      ...actorA(),
      projectId,
      code: "CAL-5D",
      name: "Cinco dias com feriado",
      workingWeek: [1, 2, 3, 4, 5],
      holidays: ["2026-01-06"],
    });
    expect(calendar.scope).toBe("PROJECT");
    expect(calendar.projectId).toBe(projectId);
    expect(calendar.isDefault).toBe(false);

    const list = await listCalendars(orgA.id, projectId);
    expect(list.map((row) => row.code)).toContain("CAL-5D");
  });

  it("código duplicado na organização conflita", async () => {
    await expectAppError(
      createCalendar({ ...actorA(), projectId, code: "CAL-5D", name: "Duplicado" }),
      "CONFLICT"
    );
  });

  it("semana de trabalho e feriados inválidos são rejeitados", async () => {
    await expectAppError(
      createCalendar({ ...actorA(), projectId, code: "CAL-X1", name: "Sem dias", workingWeek: [] }),
      "VALIDATION_ERROR"
    );
    await expectAppError(
      createCalendar({
        ...actorA(),
        projectId,
        code: "CAL-X2",
        name: "Dia ruim",
        workingWeek: [1, 2, 3],
        holidays: [7] as unknown as string[],
      }),
      "VALIDATION_ERROR"
    );
    await expectAppError(
      createCalendar({
        ...actorA(),
        projectId,
        code: "CAL-X3",
        name: "Data inexistente",
        workingWeek: [1, 2, 3],
        holidays: ["2026-02-31"],
      }),
      "VALIDATION_ERROR"
    );
  });

  it("escopo ORGANIZATION cria calendário compartilhado", async () => {
    const calendar = await createCalendar({
      ...actorA(),
      projectId,
      scope: "ORGANIZATION",
      code: "CAL-ORG",
      name: "Organização",
      workingWeek: [1, 2, 3, 4, 5],
    });
    expect(calendar.scope).toBe("ORGANIZATION");
    expect(calendar.projectId).toBeNull();

    const list = await listCalendars(orgA.id, projectId);
    expect(list.map((row) => row.code)).toContain("CAL-ORG");
  });
});

describe("default por escopo e CPM", () => {
  it("só existe um default por escopo", async () => {
    const first = await createCalendar({
      ...actorA(),
      projectId,
      code: "CAL-DEF-A",
      name: "Default A",
      workingWeek: [1, 2, 3, 4, 5],
      holidays: ["2026-01-06"],
      isDefault: true,
    });
    expect(first.isDefault).toBe(true);

    const second = await createCalendar({
      ...actorA(),
      projectId,
      code: "CAL-DEF-B",
      name: "Default B",
      workingWeek: [1, 2, 3, 4, 5],
      isDefault: true,
    });
    expect(second.isDefault).toBe(true);
    projectDefaultId = second.id;

    const list = await listCalendars(orgA.id, projectId);
    const previous = list.find((row) => row.code === "CAL-DEF-A")!;
    expect(previous.isDefault).toBe(false);
  });

  it("default do projeto vence o da organização no CPM", async () => {
    // Default da org com feriado em 06/01; default do projeto sem feriados.
    await createCalendar({
      ...actorA(),
      projectId,
      scope: "ORGANIZATION",
      code: "CAL-DEF-ORG",
      name: "Default org com feriado",
      workingWeek: [1, 2, 3, 4, 5],
      holidays: ["2026-01-06"],
      isDefault: true,
    });

    const activity = await createActivity({
      ...actorA(),
      projectId,
      name: "Sem calendário próprio",
      duration: 3,
      plannedStart: "2026-01-05",
      plannedFinish: "2026-01-07",
    });
    activityId = activity.id;

    // Default do projeto (CAL-DEF-B, sem feriado) vence o da org: 05–07/01.
    const cpm = await recalculateSchedule(orgA.id, projectId);
    expect(cpm.nodes.find((node) => node.id === activityId)!.earlyFinish).toBe("2026-01-07");
  });

  it("sem default de projeto, o da organização é aplicado", async () => {
    // Remove o default do projeto (sem atividades vinculadas a ele).
    await deleteCalendar({ ...actorA(), calendarId: projectDefaultId });

    // Org default tem feriado 06/01: 05, 07, 08 ⇒ fim 08/01.
    const cpm = await recalculateSchedule(orgA.id, projectId);
    expect(cpm.nodes.find((node) => node.id === activityId)!.earlyFinish).toBe("2026-01-08");
  });
});

describe("atividade vinculada ao calendário", () => {
  it("atividade usa o calendário vinculado e a atualização recalcula", async () => {
    const calendar = await createCalendar({
      ...actorA(),
      projectId,
      code: "CAL-LINK",
      name: "Vinculado",
      workingWeek: [1, 2, 3, 4, 5],
      holidays: ["2026-01-06"],
    });
    linkedCalendarId = calendar.id;

    const activity = await createActivity({
      ...actorA(),
      projectId,
      name: "Usa CAL-LINK",
      duration: 2,
      plannedStart: "2026-01-05",
      calendarId: calendar.id,
    });
    linkedActivityId = activity.id;

    // Feriado 06/01: seg 05 + 1 útil ⇒ qua 07.
    let cpm = await recalculateSchedule(orgA.id, projectId);
    expect(cpm.nodes.find((node) => node.id === linkedActivityId)!.earlyFinish).toBe("2026-01-07");

    // Tirar o feriado: termina ter 06.
    await updateCalendar({
      ...actorA(),
      calendarId: calendar.id,
      holidays: [],
    });
    cpm = await recalculateSchedule(orgA.id, projectId);
    expect(cpm.nodes.find((node) => node.id === linkedActivityId)!.earlyFinish).toBe("2026-01-06");
  });

  it("exclusão fica bloqueada enquanto houver atividade usando o calendário", async () => {
    const blocked = await expectAppError(
      deleteCalendar({ ...actorA(), calendarId: linkedCalendarId }),
      "CONFLICT"
    );
    expect(blocked.message).toMatch(/atividade/);

    // Desvincula e exclui com sucesso.
    await updateActivity({ ...actorA(), activityId: linkedActivityId, calendarId: null });
    const removed = await deleteCalendar({ ...actorA(), calendarId: linkedCalendarId });
    expect(removed.calendarId).toBe(linkedCalendarId);

    const list = await listCalendars(orgA.id, projectId);
    expect(list.map((row) => row.id)).not.toContain(linkedCalendarId);
  });
});

describe("permissão e isolamento — calendários", () => {
  it("SCHEDULE:VIEW não concede CREATE/EDIT/DELETE", () => {
    expect(can(toPermissionSet(["SCHEDULE:VIEW"]), "SCHEDULE", "CREATE")).toBe(false);
    expect(can(toPermissionSet(["SCHEDULE:VIEW"]), "SCHEDULE", "EDIT")).toBe(false);
    expect(can(toPermissionSet(["SCHEDULE:VIEW"]), "SCHEDULE", "DELETE")).toBe(false);
    expect(can(toPermissionSet(["SCHEDULE:EDIT"]), "SCHEDULE", "EDIT")).toBe(true);
  });

  it("calendário de outro tenant é NOT_FOUND", async () => {
    const [first] = await listActivities(orgA.id, projectId);
    expect(first).toBeTruthy();

    const [orgCalendar] = (await listCalendars(orgA.id, projectId)).filter(
      (row) => row.scope === "ORGANIZATION"
    );

    await expectAppError(listCalendars(orgB.id, projectId), "NOT_FOUND");
    await expectAppError(
      updateCalendar({ ...actorA(), organizationId: orgB.id, calendarId: orgCalendar.id, name: "Invasor" }),
      "NOT_FOUND"
    );
    await expectAppError(
      deleteCalendar({ ...actorA(), organizationId: orgB.id, calendarId: orgCalendar.id }),
      "NOT_FOUND"
    );
  });
});
