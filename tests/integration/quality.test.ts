// Qualidade (E13, §33): modelos de checklist, execues com snapshot e
// respostas, inspees com critrio de aceite e evidncia obrigatria para
// PASS/FAIL. Estados reais em Postgres + isolamento de tenant.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import {
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
} from "@/modules/quality/templates";
import {
  createChecklistExecution,
  updateChecklistExecution,
  transitionChecklistExecution,
  deleteChecklistExecution,
} from "@/modules/quality/executions";
import {
  createInspection,
  updateInspection,
  transitionInspection,
  deleteInspection,
} from "@/modules/quality/inspections";
import { createPhoto, preparePhotoUpload } from "@/modules/field/photos";
import {
  getChecklistExecutionRow,
  getChecklistTemplateRow,
  getInspectionRow,
  listChecklistExecutions,
  listChecklistTemplates,
  listInspections,
  listQualitySummaries,
} from "@/modules/quality/selectors";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let otherProjectId: string;

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

const baseItems = [
  { key: "i1", text: "Conferir nivelamento do conjunto", required: true },
  { key: "i2", text: "Registrar fotografia", required: false },
];

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Esperava AppError "${code}", mas a operao concluiu.`);
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Test@1234");
  userA = await prisma.user.create({
    data: { email: `quality-a-${suffix}@test.local`, name: "Quality A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `quality-b-${suffix}@test.local`, name: "Quality B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Quality A ${suffix}`,
    slug: `quality-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Quality B ${suffix}`,
    slug: `quality-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-QUALITY-${suffix.toUpperCase()}`,
    name: "Projeto Qualidade",
    status: "ACTIVE",
  });
  projectId = project.id;

  const other = await createProject({
    ...actorA(),
    code: `PRJ-QUALITY2-${suffix.toUpperCase()}`,
    name: "Outro Projeto Qualidade",
    status: "ACTIVE",
  });
  otherProjectId = other.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("modelo de checklist (E13-US01)", () => {
  let templateId: string;

  it("cria com cdigo automtico CT001 e itens sem resposta", async () => {
    const template = await createChecklistTemplate({
      ...actorA(),
      projectId,
      name: "Checklist de fundaes",
      description: "Rotina de concreto",
      items: baseItems,
    });
    templateId = template.id;
    expect(template.code).toBe("CT001");

    const row = await getChecklistTemplateRow(orgA.id, templateId);
    expect(row.itemCount).toBe(2);
    expect(row.requiredCount).toBe(1);
    expect(row.items[0].result ?? null).toBeNull();
    expect(row.executionCount).toBe(0);
  });

  it("no aceita modelo sem itens", async () => {
    await expectAppError(
      createChecklistTemplate({ ...actorA(), projectId, name: "Vazio", items: [] }),
      "VALIDATION_ERROR"
    );
  });

  it("cdigo duplicado no projeto d CONFLICT", async () => {
    await expectAppError(
      createChecklistTemplate({
        ...actorA(),
        projectId,
        code: "CT001",
        name: "Duplicado",
        items: baseItems,
      }),
      "CONFLICT"
    );
  });

  it("edita nome e itens", async () => {
    const updated = await updateChecklistTemplate({
      ...actorA(),
      templateId,
      name: "Checklist de fundaes v2",
      items: [...baseItems, { key: "i3", text: "Aferir prumo", required: true }],
    });
    expect(updated.name).toBe("Checklist de fundaes v2");
    expect(updated.version).toBeGreaterThan(1);
  });

  it("apaga modelo livre e depois de executado d CONFLICT", async () => {
    const disposable = await createChecklistTemplate({
      ...actorA(),
      projectId,
      name: "Descartvel",
      items: baseItems,
    });
    const removed = await deleteChecklistTemplate({
      ...actorA(),
      templateId: disposable.id,
    });
    expect(removed.templateId).toBe(disposable.id);
    await expect(getChecklistTemplateRow(orgA.id, disposable.id)).rejects.toThrow();

    // modelo em uso: protegido (a trilha  auditvel)
    await createChecklistExecution({ ...actorA(), projectId, templateId });
    await expectAppError(
      deleteChecklistTemplate({ ...actorA(), templateId }),
      "CONFLICT"
    );
  });
});

describe("execuo de checklist (E13-US01, §33)", () => {
  let templateId: string;
  let templateCode: string;
  let executionId: string;

  beforeAll(async () => {
    const template = await createChecklistTemplate({
      ...actorA(),
      projectId,
      name: "Checklist de inspeo de armao",
      items: baseItems,
    });
    templateId = template.id;
    templateCode = template.code;
  }, 60000);

  it("cria com snapshot do modelo (CDIGO CE001, respostas vazias)", async () => {
    const execution = await createChecklistExecution({
      ...actorA(),
      projectId,
      templateId,
      clientUuid: randomUUID(),
    });
    executionId = execution.id;
    expect(execution.code).toMatch(/^CE\d{3}$/);
    expect(execution.status).toBe("DRAFT");
    expect(execution.templateCode).toBe(templateCode);

    const row = await getChecklistExecutionRow(orgA.id, executionId);
    expect(row.items).toHaveLength(2);
    expect(row.summary.complete).toBe(false);
    expect(row.editable).toBe(true);
  });

  it("reenvio idempotente do mesmo clientUuid devolve a mesma execuo", async () => {
    const clientUuid = randomUUID();
    const first = await createChecklistExecution({
      ...actorA(),
      projectId,
      templateId,
      clientUuid,
    });
    const second = await createChecklistExecution({
      ...actorA(),
      projectId,
      templateId,
      clientUuid,
    });
    expect(second.id).toBe(first.id);
  });

  it("no aceita respostas nem excluso fora do rascunho", async () => {
    // conclui com o obrigatrio respondido
    await updateChecklistExecution({
      ...actorA(),
      executionId,
      items: [
        { key: "i1", text: baseItems[0].text, required: true, result: "PASS", note: null },
        { key: "i2", text: baseItems[1].text, required: false, result: null, note: null },
      ],
    });
    await transitionChecklistExecution({ ...actorA(), executionId, action: "COMPLETE" });

    await expectAppError(
      updateChecklistExecution({
        ...actorA(),
        executionId,
        items: [{ key: "i1", text: "x", required: true, result: "FAIL", note: null }],
      }),
      "CONFLICT"
    );
    // concluda no pode ser excluda — reabrir para liberar
    await expectAppError(deleteChecklistExecution({ ...actorA(), executionId }), "CONFLICT");
    await transitionChecklistExecution({ ...actorA(), executionId, action: "REOPEN" });
    expect((await getChecklistExecutionRow(orgA.id, executionId)).status).toBe("DRAFT");
  });

  it("CONCLUDE exige resposta em todos os itens obrigatrios", async () => {
    // limpa as respostas e tenta concluir com o obrigatrio pendente
    await updateChecklistExecution({
      ...actorA(),
      executionId,
      items: [
        { key: "i1", text: baseItems[0].text, required: true, result: null, note: null },
        { key: "i2", text: baseItems[1].text, required: false, result: null, note: null },
      ],
    });
    await expectAppError(
      transitionChecklistExecution({ ...actorA(), executionId, action: "COMPLETE" }),
      "VALIDATION_ERROR"
    );

    await updateChecklistExecution({
      ...actorA(),
      executionId,
      items: [
        { key: "i1", text: baseItems[0].text, required: true, result: "PASS", note: null },
        { key: "i2", text: baseItems[1].text, required: false, result: null, note: null },
        { key: "i3", text: "Aferir prumo", required: true, result: "FAIL", note: "desvio 2 cm" },
      ],
    });

    const completed = await transitionChecklistExecution({
      ...actorA(),
      executionId,
      action: "COMPLETE",
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).not.toBeNull();

    const row = await getChecklistExecutionRow(orgA.id, executionId);
    expect(row.summary.failed).toBe(1);
    expect(row.summary.complete).toBe(true);
  });

  it("CANCELAR exige motivo", async () => {
    const other = await createChecklistExecution({ ...actorA(), projectId, templateId });
    await expectAppError(
      transitionChecklistExecution({ ...actorA(), executionId: other.id, action: "CANCEL" }),
      "VALIDATION_ERROR"
    );
    const cancelled = await transitionChecklistExecution({
      ...actorA(),
      executionId: other.id,
      action: "CANCEL",
      reason: "fora do escopo",
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("fora do escopo");
    // cancelada  apagvel (s COMPLETED  trilha)
    await deleteChecklistExecution({ ...actorA(), executionId: other.id });
  });

  it("seleciona por inspeo/estado com filtros", async () => {
    const draft = await createChecklistExecution({ ...actorA(), projectId, templateId });
    const drafts = await listChecklistExecutions(orgA.id, projectId, { status: "DRAFT" });
    expect(drafts.some((row) => row.id === draft.id)).toBe(true);

    const completed = await listChecklistExecutions(orgA.id, projectId, {
      status: "COMPLETED",
    });
    expect(completed.some((row) => row.id === executionId)).toBe(true);
  });
});

describe("inspeo (E13-US02, §33)", () => {
  let inspectionId: string;

  it("cria PLANNED com critrio e cdigo IN001", async () => {
    const inspection = await createInspection({
      ...actorA(),
      projectId,
      title: "Inspeo de armao do pilar P03",
      inspectionDate: "2026-03-10",
      criterion: "Armadura conferida x projeto, desvio mximo 5 mm",
    });
    inspectionId = inspection.id;
    expect(inspection.code).toBe("IN001");
    expect(inspection.status).toBe("PLANNED");

    const row = await getInspectionRow(orgA.id, inspectionId);
    expect(row.isOpen).toBe(true);
    expect(row.hasEvidence).toBe(false);
  });

  it("edita enquanto PLANNED e falha ao editar encerrada", async () => {
    const updated = await updateInspection({
      ...actorA(),
      inspectionId,
      title: "Inspeo de armao do pilar P03 (rev. 1)",
    });
    expect(updated.title).toContain("rev. 1");
    expect(updated.version).toBeGreaterThan(1);
  });

  it("PLANNED → EXECUTED e PASS sem evidncia  bloqueado", async () => {
    const executed = await transitionInspection({
      ...actorA(),
      inspectionId,
      action: "EXECUTE",
    });
    expect(executed.status).toBe("EXECUTED");
    expect(executed.executedAt).not.toBeNull();

    await expectAppError(
      transitionInspection({ ...actorA(), inspectionId, action: "PASS" }),
      "VALIDATION_ERROR"
    );
    await expectAppError(
      transitionInspection({ ...actorA(), inspectionId, action: "FAIL" }),
      "VALIDATION_ERROR"
    );
  });

  it("FAIL exige descrever a no conformidade", async () => {
    // evidncia primeiro (checklist concluido vinculado  inspeo)
    const template = await createChecklistTemplate({
      ...actorA(),
      projectId,
      name: "Checklist da inspeo P03",
      items: baseItems,
    });
    const execution = await createChecklistExecution({
      ...actorA(),
      projectId,
      templateId: template.id,
      inspectionId,
    });
    await updateChecklistExecution({
      ...actorA(),
      executionId: execution.id,
      items: [{ key: "i1", text: baseItems[0].text, required: true, result: "PASS", note: null }],
    });
    await transitionChecklistExecution({
      ...actorA(),
      executionId: execution.id,
      action: "COMPLETE",
    });

    await expectAppError(
      transitionInspection({ ...actorA(), inspectionId, action: "FAIL" }),
      "VALIDATION_ERROR"
    );

    const failed = await transitionInspection({
      ...actorA(),
      inspectionId,
      action: "FAIL",
      resultNotes: "Desvio de 12 cm na armadura superior do P03.",
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.resultNotes).toContain("12 cm");

    const row = await getInspectionRow(orgA.id, inspectionId);
    expect(row.hasEvidence).toBe(true);
    expect(row.completedChecklistCount).toBe(1);
  });

  it("FAILED reabre para EXECUTED e pode ser aprovada depois", async () => {
    const reopened = await transitionInspection({ ...actorA(), inspectionId, action: "REOPEN" });
    expect(reopened.status).toBe("EXECUTED");

    const passed = await transitionInspection({ ...actorA(), inspectionId, action: "PASS" });
    expect(passed.status).toBe("PASSED");

    const closed = await transitionInspection({ ...actorA(), inspectionId, action: "CLOSE" });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).not.toBeNull();

    // terminal: no edita nem aceita transies
    await expectAppError(
      updateInspection({ ...actorA(), inspectionId, title: "no pode" }),
      "CONFLICT"
    );
    await expectAppError(
      transitionInspection({ ...actorA(), inspectionId, action: "REOPEN" }),
      "VALIDATION_ERROR"
    );
  });

  it("CANCEL exige motivo e inspeo executada no  apagvel", async () => {
    const planned = await createInspection({
      ...actorA(),
      projectId,
      title: "Inspeo de alvenaria",
      inspectionDate: "2026-03-12",
      criterion: "Prumo e espaamento conforme projeto",
    });
    await transitionInspection({ ...actorA(), inspectionId: planned.id, action: "EXECUTE" });
    await expectAppError(deleteInspection({ ...actorA(), inspectionId: planned.id }), "CONFLICT");

    await expectAppError(
      transitionInspection({ ...actorA(), inspectionId: planned.id, action: "CANCEL" }),
      "VALIDATION_ERROR"
    );
    const cancelled = await transitionInspection({
      ...actorA(),
      inspectionId: planned.id,
      action: "CANCEL",
      reason: "escopo transferido",
    });
    expect(cancelled.status).toBe("CANCELLED");
    // CANCELLED volta a PLANNED e aí pode ser apagada
    await transitionInspection({ ...actorA(), inspectionId: planned.id, action: "REOPEN" });
    await deleteInspection({ ...actorA(), inspectionId: planned.id });
    await expect(getInspectionRow(orgA.id, planned.id)).rejects.toThrow();
  });

  it("foto de evidncia s vincula  inspeo do mesmo projeto", async () => {
    const buffer = Buffer.from("png-fake-bytes");
    const file = preparePhotoUpload({
      name: "evidencia.png",
      type: "image/png",
      size: buffer.length,
      buffer,
    });

    // inspeo de OUTRO projeto no serve de vnculo
    const foreign = await createInspection({
      ...actorA(),
      projectId: otherProjectId,
      title: "Inspeo de outro projeto",
      inspectionDate: "2026-03-15",
      criterion: "isolamento de projeto",
    });
    await expectAppError(
      createPhoto({ ...actorA(), projectId, inspectionId: foreign.id, file }),
      "VALIDATION_ERROR"
    );

    const photo = await createPhoto({
      ...actorA(),
      projectId,
      inspectionId,
      caption: "Evidncia da inspeo",
      file,
    });
    expect(photo.inspectionId).toBe(inspectionId);

    const row = await getInspectionRow(orgA.id, inspectionId);
    expect(row.photoCount).toBe(1);
    expect(row.hasEvidence).toBe(true);
  });
});

describe("portflio e isolamento de tenant (§33)", () => {
  it("resumo por projeto conta modelos, execues e inspees", async () => {
    const summaries = await listQualitySummaries(orgA.id);
    const summary = summaries.find((row) => row.projectId === projectId);
    expect(summary).toBeDefined();
    expect(summary!.board.templates).toBeGreaterThan(0);
    expect(summary!.board.executions).toBeGreaterThan(0);
    expect(summary!.board.inspections).toBeGreaterThan(0);
    expect(summary!.board.closed).toBeGreaterThan(0);
  });

  it("org B no enxerga os registros de qualidade da org A", async () => {
    const inspection = await createInspection({
      ...actorA(),
      projectId,
      title: "Isolamento",
      inspectionDate: "2026-03-20",
      criterion: "somente org A",
    });

    await expectAppError(getInspectionRow(orgB.id, inspection.id), "NOT_FOUND");
    await expectAppError(listChecklistTemplates(orgB.id, projectId), "NOT_FOUND");
    await expect(listInspections(orgB.id, projectId)).rejects.toThrow();
  });

  it("seleciona modelo por id com escopo de organizao", async () => {
    const template = await createChecklistTemplate({
      ...actorA(),
      projectId,
      name: "Escopo",
      items: baseItems,
    });
    const row = await getChecklistTemplateRow(orgA.id, template.id);
    expect(row.code).toBe(template.code);
    await expectAppError(getChecklistTemplateRow(orgB.id, template.id), "NOT_FOUND");
  });
});
