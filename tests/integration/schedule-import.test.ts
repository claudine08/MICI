import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { createWbsNode } from "@/modules/wbs/wbs";
import { importSchedule, applyCalendarToSchedule } from "@/modules/schedule/importer";
import { parseScheduleFile, type ParsedSchedule, type ParsedTask } from "@/modules/schedule/msproject";
import { listActivities, listDependencies } from "@/modules/schedule/selectors";
import { recalculateSchedule } from "@/modules/schedule/cpm";
import { createCalendar } from "@/modules/schedule/calendars";
import {
  createScheduleTemplate,
  deleteScheduleTemplate,
  listScheduleTemplates,
  loadTemplateSchedule,
} from "@/modules/schedule/templates";

// Importação MS Project (E07 import, §27): replace-all, dependências/CPM/WBS,
// aplicar calendário ao cronograma e templates reutilizáveis — no CI com
// fixture real de cozinha industrial (CSV e XML, 66 tarefas / 74 dependências).

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

const csvFixture = readFileSync(
  new URL("../fixtures/template_cronograma_cozinha_industrial.csv", import.meta.url),
  "utf8"
);
const xmlFixture = readFileSync(
  new URL("../fixtures/template_cronograma_cozinha_industrial.xml", import.meta.url),
  "utf8"
);

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;

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

function parsedTask(sourceId: string, name: string): ParsedTask {
  return {
    sourceId,
    wbs: null,
    outlineLevel: 1,
    name,
    type: "TASK",
    durationDays: 1,
    start: "2026-11-02",
    finish: "2026-11-02",
    notes: null,
    percentComplete: 0,
    resources: null,
    workHours: null,
    cost: null,
  };
}

function parsedDep(predecessor: string, successor: string) {
  return { predecessorSourceId: predecessor, successorSourceId: successor, type: "FS" as const, lagDays: 0 };
}

function emptySchedule(
  tasks: ParsedTask[],
  dependencies: ParsedSchedule["dependencies"]
): ParsedSchedule {
  return {
    sourceName: "grafo de teste",
    sourceFormat: "CSV",
    projectStart: "2026-11-02",
    calendar: null,
    tasks,
    dependencies,
    warnings: [],
  };
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `imp-a-${suffix}@test.local`, name: "Import A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `imp-b-${suffix}@test.local`, name: "Import B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Import A ${suffix}`,
    slug: `imp-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Import B ${suffix}`,
    slug: `imp-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Importação",
  });
  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Importação",
    clientId: client.id,
    status: "ACTIVE",
    // sem startDate: o import deve ancorar no início do arquivo.
  });
  projectId = project.id;

  // Nó de WBS com código igual ao do arquivo ("2.1") para testar o religamento.
  await createWbsNode({ ...actorA(), projectId, code: "2.1", name: "Gestão" });
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("importação CSV (replace-all, E07 import)", () => {
  it("substitui o cronograma existente e ancora o início do projeto", async () => {
    // Atividade pré-existente que deve ser substituída.
    await prisma.scheduleActivity.create({
      data: {
        organizationId: orgA.id,
        projectId,
        code: "OLD",
        name: "Atividade antiga",
        duration: 1,
        orderIndex: 0,
        createdBy: userA.id,
      },
    });

    const schedule = parseScheduleFile("template.csv", csvFixture);
    const summary = await importSchedule({ ...actorA(), projectId, schedule });

    expect(summary.activityCount).toBe(66);
    expect(summary.dependencyCount).toBe(74);
    expect(summary.milestoneCount).toBe(11);
    expect(summary.summaryCount).toBe(10);
    expect(summary.replacedActivities).toBe(1);
    expect(summary.sourceFormat).toBe("CSV");
    // WBS: só o nó "2.1" existe no projeto — os demais códigos do arquivo geram aviso.
    expect(summary.warnings.some((warning) => warning.includes("WBS"))).toBe(true);
    expect(summary.cpm.projectFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.cpm.criticalCount).toBeGreaterThan(0);

    const activities = await listActivities(orgA.id, projectId);
    expect(activities).toHaveLength(66);
    expect(activities.map((row) => row.code)).toEqual(
      Array.from({ length: 66 }, (_, index) => `A${String(index + 1).padStart(3, "0")}`)
    );
    expect(activities.find((row) => row.code === "OLD")).toBeUndefined();

    // Primeira linha do arquivo vira A001.
    expect(activities[0].name).toBe("INÍCIO DO PROJETO");
    expect(activities[0].activityType).toBe("MILESTONE");
    expect(activities[0].plannedStart).toBe("2026-11-02");

    const dependencies = await listDependencies(orgA.id, projectId);
    expect(dependencies).toHaveLength(74);

    // Âncora do projeto = início do arquivo.
    const project = await prisma.project.findFirst({
      where: { id: projectId },
      select: { startDate: true },
    });
    expect(project?.startDate?.toISOString().slice(0, 10)).toBe("2026-11-02");

    // WBS religado pelo código do arquivo.
    expect(summary.wbsLinkedCount).toBeGreaterThanOrEqual(1);
    expect(activities.some((row) => row.wbsNodeId !== null)).toBe(true);

    // Auditoria única de importação + evento de domínio.
    const audit = await prisma.auditEvent.findFirst({
      where: { projectId, action: "IMPORT", objectType: "ScheduleActivity" },
    });
    expect(audit).toBeTruthy();
    const domain = await prisma.domainEvent.findFirst({
      where: { projectId, eventType: "Schedule.Imported" },
    });
    expect(domain).toBeTruthy();
  });

  it("reimportar substitui de novo sem conflito de código", async () => {
    const schedule = parseScheduleFile("template.csv", csvFixture);
    const summary = await importSchedule({ ...actorA(), projectId, schedule });
    expect(summary.replacedActivities).toBe(66);

    const activities = await listActivities(orgA.id, projectId);
    expect(activities).toHaveLength(66);
    expect(new Set(activities.map((row) => row.code)).size).toBe(66);
  });

  it("importa com calendário opcional vinculado a todas as atividades", async () => {
    const calendar = await createCalendar({
      ...actorA(),
      code: `IMP-${suffix.toUpperCase()}`,
      name: "Calendário do import",
      scope: "ORGANIZATION",
    });

    const schedule = parseScheduleFile("template.csv", csvFixture);
    const summary = await importSchedule({
      ...actorA(),
      projectId,
      schedule,
      calendarId: calendar.id,
    });
    expect(summary.calendarId).toBe(calendar.id);

    const activities = await listActivities(orgA.id, projectId);
    expect(activities.every((row) => row.calendarId === calendar.id)).toBe(true);
  });

  it("calendário de outra organização é VALIDATION_ERROR", async () => {
    const foreign = await createCalendar({
      organizationId: orgB.id,
      actorId: userB.id,
      actorLabel: userB.email,
      code: `FOR-${suffix.toUpperCase()}`,
      name: "Calendário alheio",
      scope: "ORGANIZATION",
    });
    await expectAppError(
      importSchedule({
        ...actorA(),
        projectId,
        schedule: parseScheduleFile("template.csv", csvFixture),
        calendarId: foreign.id,
      }),
      "VALIDATION_ERROR"
    );
  });
});

describe("validação do grafo antes de escrever (E07 import)", () => {
  it("dependência para atividade inexistente é rejeitada sem tocar no banco", async () => {
    const before = await prisma.scheduleActivity.count({
      where: { organizationId: orgA.id, projectId },
    });
    await expectAppError(
      importSchedule({
        ...actorA(),
        projectId,
        schedule: emptySchedule(
          [parsedTask("1", "A"), parsedTask("2", "B")],
          [parsedDep("1", "2"), parsedDep("9", "2")]
        ),
      }),
      "VALIDATION_ERROR"
    );
    const after = await prisma.scheduleActivity.count({
      where: { organizationId: orgA.id, projectId },
    });
    expect(after).toBe(before);
  });

  it("ciclo no arquivo é rejeitado", async () => {
    const error = await expectAppError(
      importSchedule({
        ...actorA(),
        projectId,
        schedule: emptySchedule(
          [parsedTask("1", "A"), parsedTask("2", "B")],
          [parsedDep("1", "2"), parsedDep("2", "1")]
        ),
      }),
      "VALIDATION_ERROR"
    );
    expect(error.message).toMatch(/ciclo/i);
  });

  it("id duplicado no arquivo é rejeitado", async () => {
    await expectAppError(
      importSchedule({
        ...actorA(),
        projectId,
        schedule: emptySchedule(
          [parsedTask("1", "A"), parsedTask("1", "A de novo")],
          []
        ),
      }),
      "VALIDATION_ERROR"
    );
  });

  it("import em projeto de outro tenant é NOT_FOUND", async () => {
    await expectAppError(
      importSchedule({
        ...actorA(),
        organizationId: orgB.id,
        projectId,
        schedule: emptySchedule([parsedTask("1", "A")], []),
      }),
      "NOT_FOUND"
    );
  });
});

describe("aplicar calendário ao cronograma (E07 import)", () => {
  it("recalcula e persiste as datas do CPM com a nova semana útil", async () => {
    // Reimporta sem calendário para partir do CSV original.
    await importSchedule({ ...actorA(), projectId, schedule: parseScheduleFile("t.csv", csvFixture) });
    const beforeCpm = await recalculateSchedule(orgA.id, projectId);

    const calendar = await createCalendar({
      ...actorA(),
      code: `MW-${suffix.toUpperCase()}`,
      name: "Seg/Qua/Sex",
      scope: "ORGANIZATION",
      workingWeek: [1, 3, 5],
    });

    const result = await applyCalendarToSchedule({
      ...actorA(),
      projectId,
      calendarId: calendar.id,
    });
    expect(result.calendarId).toBe(calendar.id);
    expect(result.updatedActivities).toBeGreaterThan(0);
    // Semana menor (3 dias úteis) empurra o fim do projeto para depois.
    expect(result.cpm.projectFinish > beforeCpm.projectFinish).toBe(true);

    const rows = await listActivities(orgA.id, projectId);
    expect(rows.every((row) => row.calendarId === calendar.id)).toBe(true);
    // Atividade não concluída com datas do CPM persistidas no planejado.
    const last = rows[rows.length - 1];
    expect(last.plannedStart).toBeTruthy();
    expect(last.plannedFinish).toBeTruthy();

    const audit = await prisma.auditEvent.findFirst({
      where: { projectId, action: "CALENDAR_APPLY" },
    });
    expect(audit).toBeTruthy();
  });

  it("calendário do projeto aplicado vira o padrão do projeto", async () => {
    const projectCalendar = await createCalendar({
      ...actorA(),
      projectId,
      code: `PRJ-${suffix.toUpperCase()}`,
      name: "Calendário do projeto",
      scope: "PROJECT",
      workingWeek: [1, 2, 3, 4, 5],
      isDefault: true,
    });

    await applyCalendarToSchedule({ ...actorA(), projectId, calendarId: projectCalendar.id });

    const defaults = await prisma.projectCalendar.findMany({
      where: { organizationId: orgA.id, projectId, deletedAt: null, isDefault: true },
      select: { id: true },
    });
    expect(defaults.map((row) => row.id)).toEqual([projectCalendar.id]);
  });

  it("calendário inexistente é VALIDATION_ERROR", async () => {
    await expectAppError(
      applyCalendarToSchedule({
        ...actorA(),
        projectId,
        calendarId: "00000000-0000-4000-8000-000000000000",
      }),
      "VALIDATION_ERROR"
    );
  });
});

describe("importação XML (E07 import)", () => {
  it("mesmo cronograma pelo XML: mesmas contagens e grafos", async () => {
    const summary = await importSchedule({
      ...actorA(),
      projectId,
      schedule: parseScheduleFile("template.xml", xmlFixture),
    });
    expect(summary.sourceFormat).toBe("XML");
    expect(summary.activityCount).toBe(66);
    expect(summary.dependencyCount).toBe(74);
    expect(summary.milestoneCount).toBe(11);
    expect(summary.summaryCount).toBe(10);

    const activities = await listActivities(orgA.id, projectId);
    const kickoff = activities.find((row) => row.name === "Reunião de kick-off")!;
    expect(kickoff.duration).toBe(1);
    expect(kickoff.plannedStart).toBe("2026-11-02");
    expect(activities.filter((row) => row.activityType === "SUMMARY")).toHaveLength(10);
  });
});

describe("templates de cronograma reutilizáveis (E07 import)", () => {
  it("cria a partir do CSV com contagens e código ST001", async () => {
    const template = await createScheduleTemplate({
      ...actorA(),
      name: "Cozinha industrial",
      description: "Template de teste",
      filename: "template_cronograma_cozinha_industrial.csv",
      content: csvFixture,
    });
    expect(template.code).toBe("ST001");
    expect(template.sourceFormat).toBe("CSV");
    expect(template.activityCount).toBe(66);
    expect(template.dependencyCount).toBe(74);
    expect(template.sourceFilename).toBe("template_cronograma_cozinha_industrial.csv");
  });

  it("cria a partir do XML com código ST002", async () => {
    const template = await createScheduleTemplate({
      ...actorA(),
      name: "Cozinha industrial (XML)",
      filename: "template.xml",
      content: xmlFixture,
    });
    expect(template.code).toBe("ST002");
    expect(template.sourceFormat).toBe("XML");
  });

  it("arquivo inválido é rejeitado", async () => {
    await expectAppError(
      createScheduleTemplate({ ...actorA(), name: "Vazio", content: "ID;Nome_da_Tarefa\n" }),
      "VALIDATION_ERROR"
    );
  });

  it("lista os templates da organização", async () => {
    const templates = await listScheduleTemplates(orgA.id);
    expect(templates).toHaveLength(2);
    expect(templates.every((row) => ["ST001", "ST002"].includes(row.code))).toBe(true);
  });

  it("snapshot carrega e alimenta a importação em outro projeto", async () => {
    const schedule = await loadTemplateSchedule(orgA.id, (
      await listScheduleTemplates(orgA.id)
    ).find((row) => row.code === "ST001")!.id);
    expect(schedule.tasks).toHaveLength(66);
    expect(schedule.dependencies).toHaveLength(74);

    const client = await createClient({
      ...actorA(),
      code: `CLI2-${suffix.toUpperCase()}`,
      name: "Cliente Template",
    });
    const project = await createProject({
      ...actorA(),
      code: `PRJ2-${suffix.toUpperCase()}`,
      name: "Projeto Template",
      clientId: client.id,
      status: "ACTIVE",
    });

    const summary = await importSchedule({ ...actorA(), projectId: project.id, schedule });
    expect(summary.activityCount).toBe(66);
    expect(summary.dependencyCount).toBe(74);
    const activities = await listActivities(orgA.id, project.id);
    expect(activities).toHaveLength(66);
  });

  it("exclusão lógica some da lista e impede o load", async () => {
    const template = (await listScheduleTemplates(orgA.id)).find((row) => row.code === "ST002")!;
    const removed = await deleteScheduleTemplate({ ...actorA(), templateId: template.id });
    expect(removed.templateId).toBe(template.id);

    const templates = await listScheduleTemplates(orgA.id);
    expect(templates.map((row) => row.code)).toEqual(["ST001"]);
    await expectAppError(loadTemplateSchedule(orgA.id, template.id), "NOT_FOUND");
    await expectAppError(deleteScheduleTemplate({ ...actorA(), templateId: template.id }), "NOT_FOUND");
  });

  it("isolamento de tenant: lista vazia e load/delete NOT_FOUND", async () => {
    expect(await listScheduleTemplates(orgB.id)).toHaveLength(0);
    const template = (await listScheduleTemplates(orgA.id))[0];
    await expectAppError(loadTemplateSchedule(orgB.id, template.id), "NOT_FOUND");
    await expectAppError(
      deleteScheduleTemplate({ organizationId: orgB.id, actorId: userB.id, actorLabel: userB.email, templateId: template.id }),
      "NOT_FOUND"
    );
  });
});
