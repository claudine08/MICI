import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import { isValidTemplateItems } from "@/modules/quality/engine";
import {
  assertCodeFree,
  assertQualityProject,
  audit,
  emitDomainEvent,
  nextQualityCode,
  type ActorContext,
} from "@/modules/quality/common";

// Modelo de checklist (E13-US01): biblioteca de itens por projeto. O modelo
// guarda APENAS texto + obrigatoriedade; o resultado (PASS/FAIL/NA) nasce na
// execução, que congela um snapshot dos itens (rastro de conformidade).

export interface CreateChecklistTemplateInput {
  projectId: string;
  code?: string;
  name: string;
  description?: string;
  items: { key: string; text: string; required?: boolean }[];
}

export interface UpdateChecklistTemplateInput {
  templateId: string;
  name?: string;
  description?: string | null;
  items?: { key: string; text: string; required?: boolean }[];
}

// No modelo nunca há resultado — a regra de "item concluído" é da execução.
function sanitizeItems(items: CreateChecklistTemplateInput["items"]) {
  return items.map((item) => ({
    key: item.key.trim(),
    text: item.text.trim(),
    required: Boolean(item.required),
  }));
}

async function loadLiveTemplate(organizationId: string, templateId: string) {
  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, organizationId, deletedAt: null },
  });
  if (!template) {
    throw new AppError("NOT_FOUND", "Modelo de checklist não encontrado nesta organização.");
  }
  return template;
}

export async function createChecklistTemplate(input: ActorContext & CreateChecklistTemplateInput) {
  await assertQualityProject(input.organizationId, input.projectId);

  const items = sanitizeItems(input.items);
  if (!isValidTemplateItems(items)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Modelo inválido: informe ao menos um item com texto não vazio."
    );
  }

  let code = input.code?.trim();
  if (code) {
    await assertCodeFree(
      input.projectId,
      code,
      (where) => prisma.checklistTemplate.findFirst({ where, select: { id: true } }),
      "de modelo"
    );
  } else {
    code = await nextQualityCode(input.projectId, "CT");
  }

  const template = await prisma.checklistTemplate.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      items: items as never,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "ChecklistTemplate", "CREATE", {
    objectId: template.id,
    newValue: { code: template.code, name: template.name, items: items.length },
  });
  await emitDomainEvent(
    input,
    input.projectId,
    "Quality.ChecklistTemplate.Created",
    "ChecklistTemplate",
    template.id,
    { code: template.code, name: template.name }
  );

  return template;
}

export async function updateChecklistTemplate(
  input: ActorContext & UpdateChecklistTemplateInput
) {
  const template = await loadLiveTemplate(input.organizationId, input.templateId);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.items !== undefined) {
    const items = sanitizeItems(input.items);
    if (!isValidTemplateItems(items)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Modelo inválido: informe ao menos um item com texto não vazio."
      );
    }
    data.items = items as never;
  }
  if (Object.keys(data).length === 0) return template;

  data.updatedBy = input.actorId;
  data.version = { increment: 1 };

  const updated = await prisma.checklistTemplate.update({
    where: { id: template.id },
    data,
  });

  await audit(input, template.projectId, "ChecklistTemplate", "UPDATE", {
    objectId: template.id,
    oldValue: { name: template.name },
    newValue: { name: updated.name },
  });

  return updated;
}

export async function deleteChecklistTemplate(input: ActorContext & { templateId: string }) {
  const template = await loadLiveTemplate(input.organizationId, input.templateId);

  // Modelo em uso preserva a trilha de auditoria (a execução guarda o
  // snapshot do que foi efetivamente inspecionado).
  const executions = await prisma.checklistExecution.count({
    where: { templateId: template.id, deletedAt: null },
  });
  if (executions > 0) {
    throw new AppError(
      "CONFLICT",
      `Modelo possui ${executions} execução(ões) vinculada(s) — não é possível excluí-lo.`
    );
  }

  await prisma.checklistTemplate.update({
    where: { id: template.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });
  await audit(input, template.projectId, "ChecklistTemplate", "DELETE", {
    objectId: template.id,
    oldValue: { code: template.code, name: template.name },
  });
  await emitDomainEvent(
    input,
    template.projectId,
    "Quality.ChecklistTemplate.Deleted",
    "ChecklistTemplate",
    template.id,
    { code: template.code }
  );

  return { templateId: template.id };
}
