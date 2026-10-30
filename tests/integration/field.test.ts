// Campo (E12, §26/§38/§39): diário por dia de obra com workflow auditado,
// tarefas de campo, retrições (Identification → Removal), fotos com
// allowlist de imagem e isolamento de tenant. Estados reais em Postgres.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { createDiary, updateDiary, deleteDiary, transitionDiary } from "@/modules/field/diaries";
import { createTask, updateTask, deleteTask, transitionTask } from "@/modules/field/tasks";
import {
  createConstraint,
  updateConstraint,
  transitionConstraint,
} from "@/modules/field/constraints";
import { createPhoto, deletePhoto, photoUploadFields, preparePhotoUpload, updatePhoto } from "@/modules/field/photos";
import { createProgress, updateProgress, deleteProgress } from "@/modules/field/progress";
import { createActivity } from "@/modules/schedule/activities";
import { createActual } from "@/modules/cost/actuals";
import { createInspection } from "@/modules/quality/inspections";
import {
  listDiaries,
  getDiaryRow,
  listTasks,
  listConstraints,
  listPhotos,
  getPhotoContent,
  listFieldSummaries,
  listProgress,
  getProgressRow,
} from "@/modules/field/selectors";

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

function actorB() {
  return { organizationId: orgB.id, actorId: userB.id, actorLabel: userB.email };
}

function imagePayload(name = "obra.png") {
  const buffer = Buffer.from("png-fake-bytes");
  return preparePhotoUpload({ name, type: "image/png", size: buffer.length, buffer });
}

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
    data: { email: `field-a-${suffix}@test.local`, name: "Field A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `field-b-${suffix}@test.local`, name: "Field B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Field A ${suffix}`,
    slug: `field-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Field B ${suffix}`,
    slug: `field-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-FIELD-${suffix.toUpperCase()}`,
    name: "Projeto Campo",
    status: "ACTIVE",
  });
  projectId = project.id;

  const other = await createProject({
    ...actorA(),
    code: `PRJ-FIELD2-${suffix.toUpperCase()}`,
    name: "Outro Projeto Campo",
    status: "ACTIVE",
  });
  otherProjectId = other.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("dirio de obra (E12-US01, §26)", () => {
  it("cria dirio em DRAFT com cdigo automtico FD001", async () => {
    const diary = await createDiary({
      ...actorA(),
      projectId,
      entryDate: "2026-01-15",
      team: "5 eletricistas",
      workHours: 8,
      activities: "Aps do 2 pavimento",
    });
    expect(diary.code).toBe("FD001");
    expect(diary.status).toBe("DRAFT");

    const row = await getDiaryRow(orgA.id, diary.id);
    expect(row.entryDate).toBe("2026-01-15");
    expect(row.team).toBe("5 eletricistas");
    expect(row.isOpen).toBe(true);
  });

  it("no permite dois dirios na mesma data do projeto (nico projectId+entryDate)", async () => {
    const error = await expectAppError(
      createDiary({ ...actorA(), projectId, entryDate: "2026-01-15" }),
      "CONFLICT"
    );
    expect(error.message).toContain("FD001");
  });

  it("workflow DRAFT → SUBMITTED → APPROVED e imutabilidade terminal", async () => {
    const diary = await createDiary({ ...actorA(), projectId, entryDate: "2026-01-16" });

    // APPROVE direto do rascunho: transio invlida (passe por SUBMITTED).
    await expectAppError(
      transitionDiary({ ...actorA(), diaryId: diary.id, action: "APPROVE" }),
      "FIELD_INVALID_STATE"
    );

    const submitted = await transitionDiary({
      ...actorA(),
      diaryId: diary.id,
      action: "SUBMIT",
    });
    expect(submitted.status).toBe("SUBMITTED");

    const approved = await transitionDiary({
      ...actorA(),
      diaryId: diary.id,
      action: "APPROVE",
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedAt).not.toBeNull();

    await expectAppError(
      updateDiary({ ...actorA(), diaryId: diary.id, team: "tentativa de edio" }),
      "FIELD_INVALID_STATE"
    );
    await expectAppError(
      transitionDiary({ ...actorA(), diaryId: diary.id, action: "CANCEL" }),
      "FIELD_INVALID_STATE"
    );
    expect(approved.version).toBeGreaterThan(diary.version);
  });

  it("REJECTED volta a DRAFT por REVISE e volta a editar", async () => {
    const diary = await createDiary({ ...actorA(), projectId, entryDate: "2026-01-17" });
    await transitionDiary({ ...actorA(), diaryId: diary.id, action: "SUBMIT" });
    const rejected = await transitionDiary({
      ...actorA(),
      diaryId: diary.id,
      action: "REJECT",
      reason: "Falta o controle de segurana do dia",
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectReason).toContain("segurana");

    const revised = await transitionDiary({ ...actorA(), diaryId: diary.id, action: "REVISE" });
    expect(revised.status).toBe("DRAFT");

    const updated = await updateDiary({
      ...actorA(),
      diaryId: diary.id,
      safety: "CSI concludo",
    });
    expect(updated.safety).toBe("CSI concludo");
    expect(updated.status).toBe("DRAFT");
  });

  it("excluso lgica e leitura some da lista", async () => {
    const diary = await createDiary({ ...actorA(), projectId, entryDate: "2026-01-19" });
    await deleteDiary({ ...actorA(), diaryId: diary.id });
    const diaries = await listDiaries(orgA.id, projectId);
    expect(diaries.some((row) => row.id === diary.id)).toBe(false);
    await expectAppError(getDiaryRow(orgA.id, diary.id), "NOT_FOUND");
  });
});

describe("tarefa de campo (E12-US03)", () => {
  it("cria em OPEN com cdigo FT001 e transio feliz", async () => {
    const task = await createTask({
      ...actorA(),
      projectId,
      title: "Instalar bandejas",
      priority: "HIGH",
      dueDate: "2026-02-01",
    });
    expect(task.code).toBe("FT001");
    expect(task.status).toBe("OPEN");

    const started = await transitionTask({ ...actorA(), taskId: task.id, action: "START" });
    expect(started.status).toBe("IN_PROGRESS");

    const done = await transitionTask({ ...actorA(), taskId: task.id, action: "COMPLETE" });
    expect(done.status).toBe("DONE");
    expect(done.completedAt).not.toBeNull();

    await expectAppError(
      updateTask({ ...actorA(), taskId: task.id, title: "editado" }),
      "FIELD_INVALID_STATE"
    );
  });

  it("bloqueio exige estar em execuo e volta por UNBLOCK", async () => {
    const task = await createTask({ ...actorA(), projectId, title: "Teste bloqueio" });
    await expectAppError(
      transitionTask({ ...actorA(), taskId: task.id, action: "BLOCK" }),
      "FIELD_INVALID_STATE"
    );

    await transitionTask({ ...actorA(), taskId: task.id, action: "START" });
    const blocked = await transitionTask({ ...actorA(), taskId: task.id, action: "BLOCK" });
    expect(blocked.status).toBe("BLOCKED");

    const reopened = await transitionTask({ ...actorA(), taskId: task.id, action: "REOPEN" }).catch(
      () => null
    );
    // BLOCKED no tem REOPEN — s UNBLOCK/CANCEL.
    expect(reopened).toBeNull();
    const back = await transitionTask({ ...actorA(), taskId: task.id, action: "UNBLOCK" });
    expect(back.status).toBe("IN_PROGRESS");
  });

  it("tarefa atrasada aparece marcada nos seletores", async () => {
    const task = await createTask({
      ...actorA(),
      projectId,
      title: "Tarefa atrasada",
      dueDate: "2020-01-01",
    });
    const tasks = await listTasks(orgA.id, projectId);
    const row = tasks.find((item) => item.id === task.id);
    expect(row?.isOverdue).toBe(true);
  });

  it("excluso lgica bloqueada aps concluso", async () => {
    const task = await createTask({ ...actorA(), projectId, title: "No excluir" });
    await transitionTask({ ...actorA(), taskId: task.id, action: "START" });
    await transitionTask({ ...actorA(), taskId: task.id, action: "COMPLETE" });
    await expectAppError(deleteTask({ ...actorA(), taskId: task.id }), "FIELD_INVALID_STATE");
  });
});

describe("retrição (E12-US05, §39)", () => {
  it("Identification → Addressed → Removal com resoluo obrigatria", async () => {
    const constraint = await createConstraint({
      ...actorA(),
      projectId,
      title: "Falta autorizao da concessionria",
      type: "EXTERNAL",
      priority: "HIGH",
    });
    expect(constraint.code).toBe("CN001");
    expect(constraint.status).toBe("OPEN");

    // REMOVE direto da identificao: transio invlida (§39 exige tratamento).
    await expectAppError(
      transitionConstraint({ ...actorA(), constraintId: constraint.id, action: "REMOVE" }),
      "FIELD_INVALID_STATE"
    );

    const addressed = await transitionConstraint({
      ...actorA(),
      constraintId: constraint.id,
      action: "ADDRESS",
    });
    expect(addressed.status).toBe("ADDRESSED");

    // Em ADDRESSED a transio  vlida, mas REMOVE sem resoluo  barrado.
    await expectAppError(
      transitionConstraint({ ...actorA(), constraintId: constraint.id, action: "REMOVE" }),
      "VALIDATION_ERROR"
    );
    await expectAppError(
      transitionConstraint({ ...actorA(), constraintId: constraint.id, action: "REOPEN" }),
      "FIELD_INVALID_STATE"
    );

    const removed = await transitionConstraint({
      ...actorA(),
      constraintId: constraint.id,
      action: "REMOVE",
      resolution: "Autorizao emitida em 03/03",
    });
    expect(removed.status).toBe("REMOVED");
    expect(removed.resolution).toContain("Autorizao");
    expect(removed.removedAt).not.toBeNull();

    await expectAppError(
      updateConstraint({ ...actorA(), constraintId: constraint.id, title: "editado" }),
      "FIELD_INVALID_STATE"
    );
  });

  it("CANCELLED volta a OPEN por REOPEN", async () => {
    const constraint = await createConstraint({
      ...actorA(),
      projectId,
      title: "Restrio cancelvel",
    });
    const cancelled = await transitionConstraint({
      ...actorA(),
      constraintId: constraint.id,
      action: "CANCEL",
      reason: "No aplicvel",
    });
    expect(cancelled.status).toBe("CANCELLED");

    const reopened = await transitionConstraint({
      ...actorA(),
      constraintId: constraint.id,
      action: "REOPEN",
    });
    expect(reopened.status).toBe("OPEN");
  });

  it("retriies abertas alimentam o resumo de campo", async () => {
    await createConstraint({ ...actorA(), projectId, title: "Restrio para o quadro" });
    const summaries = await listFieldSummaries(orgA.id);
    const summary = summaries.find((row) => row.projectId === projectId);
    expect(summary).toBeDefined();
    expect(summary!.board.openConstraints).toBeGreaterThan(0);
  });
});

describe("foto de evidência (E12-US02)", () => {
  it("aceita imagem, grava hash e devolve o contedo no download", async () => {
    const diary = await createDiary({ ...actorA(), projectId, entryDate: "2026-03-01" });
    const photo = await createPhoto({
      ...actorA(),
      projectId,
      caption: "Alvenaria 2 pavimento",
      diaryId: diary.id,
      file: imagePayload(),
    });
    expect(photo.code).toBe("PH001");
    expect(photo.hash).toHaveLength(64);
    expect(photo.mimeType).toBe("image/png");

    const file = await getPhotoContent(orgA.id, photo.id);
    expect(file.mimeType).toBe("image/png");
    expect(Buffer.from(file.content).toString()).toContain("png-fake-bytes");

    const photos = await listPhotos(orgA.id, projectId, diary.id);
    expect(photos.some((row) => row.id === photo.id)).toBe(true);
    expect(photos[0].diaryCode).toBe(diary.code);
  });

  it("idempotencia offline com clientUuid (servico) e parse do multipart da rota", async () => {
    // Reenvio do mesmo clientUuid (fila offline Fatia 2) devolve a foto
    // original em vez de duplicar o binario.
    const clientUuid = randomUUID();
    const first = await createPhoto({
      ...actorA(),
      projectId,
      caption: "Captura offline",
      clientUuid,
      file: imagePayload("offline-1.png"),
    });
    const replay = await createPhoto({
      ...actorA(),
      projectId,
      caption: "Reenvio sem rede",
      clientUuid,
      file: imagePayload("offline-2.png"),
    });
    expect(replay.id).toBe(first.id);
    expect(replay.caption).toBe("Captura offline");
    const replayed = await prisma.photoEvidence.count({ where: { projectId, clientUuid } });
    expect(replayed).toBe(1);

    // O multipart da rota precisa repassar o clientUuid do form — sem isso a
    // fila offline duplicava a foto (bug da Fatia 2).
    const form = new FormData();
    form.append("caption", "Fachada norte");
    form.append("clientUuid", clientUuid);
    const fields = photoUploadFields(form);
    expect(fields.clientUuid).toBe(clientUuid);
    expect(fields.caption).toBe("Fachada norte");

    const empty = photoUploadFields(new FormData());
    expect(empty.clientUuid).toBeUndefined();

    const invalid = new FormData();
    invalid.append("diaryId", "nao-e-uuid");
    await expectAppError(Promise.resolve().then(() => photoUploadFields(invalid)), "VALIDATION_ERROR");
  });

  it("edita legenda e vnculos (dirio/atividade) depois do upload", async () => {
    const diary = await createDiary({ ...actorA(), projectId, entryDate: "2026-03-02" });
    const activity = await createActivity({
      ...actorA(),
      projectId,
      name: "Instalao eltrica",
      duration: 3,
      plannedStart: "2026-06-10",
      plannedFinish: "2026-06-12",
      progressMethod: "PHYSICAL",
    });
    const photo = await createPhoto({
      ...actorA(),
      projectId,
      file: imagePayload("editar.png"),
    });

    const updated = await updatePhoto({
      ...actorA(),
      photoId: photo.id,
      caption: "Ripas do forro",
      diaryId: diary.id,
      activityId: activity.id,
    });
    expect(updated.caption).toBe("Ripas do forro");
    expect(updated.diaryId).toBe(diary.id);
    expect(updated.activityId).toBe(activity.id);

    const rows = await listPhotos(orgA.id, projectId, diary.id);
    const row = rows.find((item) => item.id === photo.id);
    expect(row?.caption).toBe("Ripas do forro");
    expect(row?.diaryCode).toBe(diary.code);
    expect(row?.activityCode).toBe(activity.code);

    // Vnculo inexistente no projeto  barrado antes de gravar.
    await expectAppError(
      updatePhoto({ ...actorA(), photoId: photo.id, wbsNodeId: randomUUID() }),
      "VALIDATION_ERROR"
    );

    // Vnculo a outro dirio tira a foto do filtro do dirio original.
    const otherDiary = await createDiary({ ...actorA(), projectId, entryDate: "2026-03-03" });
    await updatePhoto({ ...actorA(), photoId: photo.id, diaryId: otherDiary.id });
    const stillLinked = await listPhotos(orgA.id, projectId, diary.id);
    expect(stillLinked.some((item) => item.id === photo.id)).toBe(false);
    const reLinked = await listPhotos(orgA.id, projectId, otherDiary.id);
    expect(reLinked.some((item) => item.id === photo.id)).toBe(true);
  });

  it("edita vinculo de inspecao depois do upload (evidencia de qualidade E13)", async () => {
    const inspection = await createInspection({
      ...actorA(),
      projectId,
      title: "Inspeo de evidncia",
      inspectionDate: "2026-03-05",
      criterion: "Foto da instalao conferida",
    });
    const photo = await createPhoto({
      ...actorA(),
      projectId,
      file: imagePayload("evidencia.png"),
    });

    const updated = await updatePhoto({
      ...actorA(),
      photoId: photo.id,
      inspectionId: inspection.id,
    });
    expect(updated.inspectionId).toBe(inspection.id);

    const rows = await listPhotos(orgA.id, projectId, undefined, inspection.id);
    const row = rows.find((item) => item.id === photo.id);
    expect(row?.inspectionCode).toBe(inspection.code);

    // Desvincular limpa a inspecao e tira a foto do filtro.
    const cleared = await updatePhoto({ ...actorA(), photoId: photo.id, inspectionId: null });
    expect(cleared.inspectionId).toBeNull();
    const withoutLink = await listPhotos(orgA.id, projectId, undefined, inspection.id);
    expect(withoutLink.some((item) => item.id === photo.id)).toBe(false);
  });

  it("rejeita arquivo que no  imagem", () => {
    const buffer = Buffer.from("%PDF-1.4");
    expect(() =>
      preparePhotoUpload({ name: "planta.pdf", type: "application/pdf", size: buffer.length, buffer })
    ).toThrow(AppError);
  });

  it("excluso lgica some da lista", async () => {
    const photo = await createPhoto({
      ...actorA(),
      projectId,
      file: imagePayload("remover.png"),
    });
    await deletePhoto({ ...actorA(), photoId: photo.id });
    const photos = await listPhotos(orgA.id, projectId);
    expect(photos.some((row) => row.id === photo.id)).toBe(false);
    await expectAppError(getPhotoContent(orgA.id, photo.id), "NOT_FOUND");
  });
});

describe("isolamento de tenant e escopo de projeto", () => {
  it("outro tenant no enxerga nem alcana os registros", async () => {
    const diary = await createDiary({ ...actorA(), projectId, entryDate: "2026-04-01" });
    const task = await createTask({ ...actorA(), projectId, title: "Tarefa isolada" });
    const constraint = await createConstraint({
      ...actorA(),
      projectId,
      title: "Restrio isolada",
    });
    const photo = await createPhoto({ ...actorA(), projectId, file: imagePayload("iso.png") });

    await expectAppError(getDiaryRow(orgB.id, diary.id), "NOT_FOUND");
    await expectAppError(
      updateDiary({ ...actorB(), diaryId: diary.id, team: "intruso" }),
      "NOT_FOUND"
    );
    await expectAppError(
      transitionTask({ ...actorB(), taskId: task.id, action: "START" }),
      "NOT_FOUND"
    );
    await expectAppError(
      transitionConstraint({ ...actorB(), constraintId: constraint.id, action: "ADDRESS" }),
      "NOT_FOUND"
    );
    await expectAppError(getPhotoContent(orgB.id, photo.id), "NOT_FOUND");

    // Os list() primeiro resolvem o projeto no escopo do tenant.
    await expectAppError(listDiaries(orgB.id, projectId), "NOT_FOUND");
    await expectAppError(listTasks(orgB.id, projectId), "NOT_FOUND");
    await expectAppError(listConstraints(orgB.id, projectId), "NOT_FOUND");
    await expectAppError(listPhotos(orgB.id, projectId), "NOT_FOUND");

    const bSummaries = await listFieldSummaries(orgB.id);
    expect(bSummaries.some((row) => row.projectId === projectId)).toBe(false);
  });

  it("projetos diferentes no compartilham registros", async () => {
    const diary = await createDiary({ ...actorA(), projectId, entryDate: "2026-04-02" });
    const task = await createTask({ ...actorA(), projectId, title: "Tarefa do projeto A" });

    const diariesInOther = await listDiaries(orgA.id, otherProjectId);
    const tasksInOther = await listTasks(orgA.id, otherProjectId);
    expect(diariesInOther.some((row) => row.id === diary.id)).toBe(false);
    expect(tasksInOther.some((row) => row.id === task.id)).toBe(false);

    // Cdigos so nicos por projeto — cada um recomea em FT001.
    const taskB = await createTask({
      ...actorA(),
      projectId: otherProjectId,
      title: "Tarefa do projeto B",
    });
    expect(taskB.code).toBe("FT001");
    expect(taskB.projectId).toBe(otherProjectId);
  });
});

describe("medicao de avanco fisico (E12-US04, BR-006, 12)", () => {
  it("cria PM001 no nivel Atividade e sincroniza o physicalProgress", async () => {
    const activity = await createActivity({
      ...actorA(),
      projectId,
      name: "Alvenaria 2 pavimento",
      duration: 5,
      plannedStart: "2026-06-01",
      plannedFinish: "2026-06-05",
      progressMethod: "PHYSICAL",
    });

    const measurement = await createProgress({
      ...actorA(),
      projectId,
      measurementDate: "2026-06-03",
      activityId: activity.id,
      method: "PHYSICAL",
      progressPercent: 60,
      quantityPlanned: 60,
      quantityReal: 36,
      unit: "ponto",
      criterion: "36 de 60 pontos conferidos em campo",
    });
    expect(measurement.code).toBe("PM001");
    expect(measurement.level).toBe("ACTIVITY");

    const synced = await prisma.scheduleActivity.findFirst({ where: { id: activity.id } });
    expect(synced?.physicalProgress).toBe(60);

    const row = await getProgressRow(orgA.id, measurement.id);
    expect(row.activityCode).toBe(activity.code);
    expect(row.criterion).toContain("pontos conferidos");
    expect(row.quantityReal).toBe(36);
  });

  it("criterio vazio e percentual fora da faixa sao barrados (BR-006)", async () => {
    await expectAppError(
      createProgress({
        ...actorA(),
        projectId,
        measurementDate: "2026-06-04",
        progressPercent: 50,
        criterion: "   ",
      }),
      "VALIDATION_ERROR"
    );
    await expectAppError(
      createProgress({
        ...actorA(),
        projectId,
        measurementDate: "2026-06-04",
        progressPercent: 150,
        criterion: "qualquer criterio",
      }),
      "VALIDATION_ERROR"
    );
  });

  it("edicao reaplica na atividade e exclusao nao retroage", async () => {
    const activity = await createActivity({
      ...actorA(),
      projectId,
      name: "Revestimento argamassa",
      duration: 3,
    });
    const measurement = await createProgress({
      ...actorA(),
      projectId,
      measurementDate: "2026-06-10",
      activityId: activity.id,
      progressPercent: 40,
      criterion: "40% conferido em vistoria",
    });

    const updated = await updateProgress({
      ...actorA(),
      progressId: measurement.id,
      progressPercent: 80,
    });
    expect(updated.progressPercent).toBe(80);
    let synced = await prisma.scheduleActivity.findFirst({ where: { id: activity.id } });
    expect(synced?.physicalProgress).toBe(80);

    await deleteProgress({ ...actorA(), progressId: measurement.id });
    const list = await listProgress(orgA.id, projectId);
    expect(list.some((row) => row.id === measurement.id)).toBe(false);
    await expectAppError(getProgressRow(orgA.id, measurement.id), "NOT_FOUND");

    // A exclusao nao retroage o avanco aplicado: a proxima medicao corrige.
    synced = await prisma.scheduleActivity.findFirst({ where: { id: activity.id } });
    expect(synced?.physicalProgress).toBe(80);
  });

  it("custo registrado nao altera o avanco fisico (BR-006)", async () => {
    const activity = await createActivity({
      ...actorA(),
      projectId,
      name: "Fundacao direta",
      duration: 4,
    });
    await createProgress({
      ...actorA(),
      projectId,
      measurementDate: "2026-06-12",
      activityId: activity.id,
      progressPercent: 60,
      criterion: "60% medido no canteiro",
    });

    await createActual({
      ...actorA(),
      projectId,
      description: "Concreto fck30",
      amount: 12500,
      incurredAt: "2026-06-12",
    });

    const synced = await prisma.scheduleActivity.findFirst({ where: { id: activity.id } });
    expect(synced?.physicalProgress).toBe(60);
  });

  it("idempotencia offline com clientUuid (medicao, dirio, tarefa e restrio)", async () => {
    const clientUuid = randomUUID();
    const first = await createProgress({
      ...actorA(),
      projectId,
      measurementDate: "2026-06-15",
      progressPercent: 10,
      criterion: "lote 1 executado",
      clientUuid,
    });
    const replay = await createProgress({
      ...actorA(),
      projectId,
      measurementDate: "2026-06-16",
      progressPercent: 99,
      criterion: "reenvio sem rede",
      clientUuid,
    });
    expect(replay.id).toBe(first.id);
    expect(replay.progressPercent).toBe(10);

    const diaryUuid = randomUUID();
    const diary = await createDiary({
      ...actorA(),
      projectId,
      entryDate: "2026-06-20",
      clientUuid: diaryUuid,
    });
    const diaryReplay = await createDiary({
      ...actorA(),
      projectId,
      entryDate: "2026-06-20",
      team: "reenvio offline",
      clientUuid: diaryUuid,
    });
    expect(diaryReplay.id).toBe(diary.id);

    const taskUuid = randomUUID();
    const task = await createTask({
      ...actorA(),
      projectId,
      title: "Tarefa offline",
      clientUuid: taskUuid,
    });
    const taskReplay = await createTask({
      ...actorA(),
      projectId,
      title: "Tarefa offline (reenvio)",
      clientUuid: taskUuid,
    });
    expect(taskReplay.id).toBe(task.id);

    const constraintUuid = randomUUID();
    const constraint = await createConstraint({
      ...actorA(),
      projectId,
      title: "Restrio offline",
      type: "EXTERNAL",
      priority: "HIGH",
      clientUuid: constraintUuid,
    });
    const constraintReplay = await createConstraint({
      ...actorA(),
      projectId,
      title: "Restrio offline (reenvio)",
      type: "EXTERNAL",
      priority: "HIGH",
      clientUuid: constraintUuid,
    });
    expect(constraintReplay.id).toBe(constraint.id);
    expect(constraintReplay.title).toBe("Restrio offline");
  });

  it("listagem e escrita da medicao respeitam tenant", async () => {
    const measurement = await createProgress({
      ...actorA(),
      projectId,
      measurementDate: "2026-06-25",
      progressPercent: 5,
      criterion: "inicio de servico",
    });
    await expectAppError(getProgressRow(orgB.id, measurement.id), "NOT_FOUND");
    await expectAppError(listProgress(orgB.id, projectId), "NOT_FOUND");
    await expectAppError(
      updateProgress({ ...actorB(), progressId: measurement.id, progressPercent: 99 }),
      "NOT_FOUND"
    );
    await expectAppError(deleteProgress({ ...actorB(), progressId: measurement.id }), "NOT_FOUND");
  });

  it("projetos diferentes nao compartilham medicoes", async () => {
    const measurement = await createProgress({
      ...actorA(),
      projectId,
      measurementDate: "2026-06-26",
      progressPercent: 12,
      criterion: "medicao do projeto A",
    });
    const inOther = await listProgress(orgA.id, otherProjectId);
    expect(inOther.some((row) => row.id === measurement.id)).toBe(false);

    const codeRestarted = await createProgress({
      ...actorA(),
      projectId: otherProjectId,
      measurementDate: "2026-06-26",
      progressPercent: 3,
      criterion: "medicao do projeto B",
    });
    expect(codeRestarted.code).toBe("PM001");
    expect(codeRestarted.projectId).toBe(otherProjectId);
  });
});
