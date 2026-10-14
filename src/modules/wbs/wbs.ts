import { prisma } from "@/lib/prisma";
import { AppError } from "@/core/errors";
import {
  WBS_MAX_DEPTH,
  buildWbsExport,
  buildWbsTree,
  flattenWbsTree,
  nextSiblingOrder,
  nextWbsCode,
  nodeDepth,
  nodeDepthIfMoved,
  planReorder,
  validateWbsImport,
  wouldCreateCycle,
  type WbsImportNode,
} from "@/modules/wbs/engine";
import { assertWbsProject, getWbsTree, listAllWbsNodes } from "@/modules/wbs/selectors";

// WBS (E05, §74): árvore por projeto com criar/editar/mover/reordenar/
// duplicar/importar/exportar/versionar + auditoria em toda escrita.

interface ActorContext {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  correlationId?: string;
  ipAddress?: string;
}

function audit(
  input: ActorContext,
  projectId: string,
  action: string,
  data: { oldValue?: unknown; newValue?: unknown; reason?: string | null; objectId?: string | null }
) {
  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      projectId,
      objectType: "WBSNode",
      objectId: data.objectId ?? null,
      action,
      ...(data.oldValue !== undefined ? { oldValue: data.oldValue as never } : {}),
      ...(data.newValue !== undefined ? { newValue: data.newValue as never } : {}),
      reason: data.reason ?? null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

function toNodeType(value: string | undefined): "SUMMARY" | "DELIVERABLE" | "WORK_PACKAGE" {
  return value === "SUMMARY" || value === "DELIVERABLE" || value === "WORK_PACKAGE"
    ? value
    : "WORK_PACKAGE";
}

async function loadLiveNode(organizationId: string, nodeId: string) {  const node = await prisma.wBSNode.findFirst({
    where: { id: nodeId, organizationId, deletedAt: null },
  });
  if (!node) {
    throw new AppError("NOT_FOUND", "Nó de WBS não encontrado nesta organização.");
  }
  return node;
}

export interface CreateWbsNodeInput {
  projectId: string;
  code?: string;
  name: string;
  description?: string;
  nodeType?: "SUMMARY" | "DELIVERABLE" | "WORK_PACKAGE";
  parentId?: string | null;
  orderIndex?: number;
}

export async function createWbsNode(input: ActorContext & CreateWbsNodeInput) {
  await assertWbsProject(input.organizationId, input.projectId);
  const nodes = await listAllWbsNodes(input.organizationId, input.projectId);
  const parentId = input.parentId ?? null;

  if (parentId) {
    const parent = nodes.find((node) => node.id === parentId && !node.deletedAt);
    if (!parent) {
      throw new AppError("VALIDATION_ERROR", "Pai inválido para este projeto.");
    }
    if (nodeDepth(parentId, nodes) + 1 >= WBS_MAX_DEPTH) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Profundidade máxima de ${WBS_MAX_DEPTH} níveis excedida.`
      );
    }
  }

  let code = input.code?.trim();
  if (code) {
    if (nodes.some((node) => node.code === code)) {
      throw new AppError("CONFLICT", `Código de WBS "${code}" já existe no projeto.`);
    }
  } else {
    code = nextWbsCode(nodes, parentId);
  }
  if (code.length > 32) {
    throw new AppError("VALIDATION_ERROR", "Código de WBS excede 32 caracteres.");
  }

  const orderIndex = input.orderIndex ?? nextSiblingOrder(nodes, parentId);

  const node = await prisma.wBSNode.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      parentId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      ...(input.nodeType ? { nodeType: input.nodeType } : {}),
      orderIndex,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "WBSNode",
        objectId: node.id,
        action: "CREATE",
        newValue: { code: node.code, name: node.name, parentId: node.parentId },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Wbs.NodeCreated",
        aggregateType: "WBSNode",
        aggregateId: node.id,
        payload: { code: node.code, name: node.name },
      },
    });
  });

  return node;
}

export interface UpdateWbsNodeInput {
  nodeId: string;
  code?: string;
  name?: string;
  description?: string | null;
  nodeType?: "SUMMARY" | "DELIVERABLE" | "WORK_PACKAGE";
  parentId?: string | null;
}

export async function updateWbsNode(input: ActorContext & UpdateWbsNodeInput) {
  const node = await loadLiveNode(input.organizationId, input.nodeId);
  const nodes = await listAllWbsNodes(input.organizationId, node.projectId);

  if (input.code !== undefined) {
    const code = input.code.trim();
    if (code !== node.code && nodes.some((item) => item.code === code)) {
      throw new AppError("CONFLICT", `Código de WBS "${code}" já existe no projeto.`);
    }
  }

  const moving = input.parentId !== undefined && (input.parentId ?? null) !== node.parentId;
  const nextParentId = input.parentId ?? node.parentId;
  let nextOrderIndex = node.orderIndex;

  if (moving) {
    if (nextParentId === node.id) {
      throw new AppError("VALIDATION_ERROR", "Um nó não pode ser pai de si mesmo.");
    }
    if (nextParentId && !nodes.some((item) => item.id === nextParentId && !item.deletedAt)) {
      throw new AppError("VALIDATION_ERROR", "Pai inválido para este projeto.");
    }
    if (wouldCreateCycle(node.id, nextParentId, nodes)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Movimento inválido: o nó não pode ser movido para dentro de um descendente."
      );
    }
    const deepest = nodeDepthIfMoved(node.id, nextParentId, nodes);
    if (deepest >= WBS_MAX_DEPTH) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Profundidade máxima de ${WBS_MAX_DEPTH} níveis excedida após o movimento.`
      );
    }
    nextOrderIndex = nextSiblingOrder(nodes, nextParentId);
  }

  const updated = await prisma.wBSNode.update({
    where: { id: node.id },
    data: {
      ...(input.code !== undefined ? { code: input.code.trim() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.nodeType !== undefined ? { nodeType: input.nodeType } : {}),
      ...(moving ? { parentId: nextParentId, orderIndex: nextOrderIndex } : {}),
      updatedBy: input.actorId,
      version: { increment: 1 },
    },
  });

  await audit(input, node.projectId, moving ? "MOVE" : "UPDATE", {
    objectId: node.id,
    oldValue: { code: node.code, name: node.name, parentId: node.parentId },
    newValue: { code: updated.code, name: updated.name, parentId: updated.parentId },
  });

  return updated;
}

export interface ReorderWbsInput {
  projectId: string;
  parentId?: string | null;
  orderedIds: string[];
}

export async function reorderWbsNodes(input: ActorContext & ReorderWbsInput) {
  await assertWbsProject(input.organizationId, input.projectId);
  const nodes = await listAllWbsNodes(input.organizationId, input.projectId);
  const parentId = input.parentId ?? null;

  const plan = planReorder(nodes, parentId, input.orderedIds);
  if (!plan.ok) {
    throw new AppError("VALIDATION_ERROR", plan.error, {
      details: { parentId, orderedIds: input.orderedIds },
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const update of plan.updates) {
      await tx.wBSNode.update({
        where: { id: update.id },
        data: { orderIndex: update.orderIndex, updatedBy: input.actorId, version: { increment: 1 } },
      });
    }
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "WBSNode",
        objectId: null,
        action: "REORDER",
        newValue: { parentId, orderedIds: input.orderedIds },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  });

  return { parentId, orderedIds: input.orderedIds };
}

// BR-010/§0.1 regra 19 — exclusão lógica, bloqueada enquanto houver estrutura
// ou rastreabilidade (filhos e vínculo com requisitos).
export async function deleteWbsNode(input: ActorContext & { nodeId: string }) {
  const node = await loadLiveNode(input.organizationId, input.nodeId);

  const [children, linkedRequirements] = await Promise.all([
    prisma.wBSNode.count({
      where: { organizationId: input.organizationId, projectId: node.projectId, parentId: node.id, deletedAt: null },
    }),
    prisma.requirement.count({
      where: { organizationId: input.organizationId, wbsNodeId: node.id, deletedAt: null },
    }),
  ]);

  if (children > 0) {
    throw new AppError("CONFLICT", `Nó possui ${children} filho(s): remova ou mova-os primeiro.`);
  }
  if (linkedRequirements > 0) {
    throw new AppError(
      "CONFLICT",
      `Nó vinculado a ${linkedRequirements} requisito(s): desvincule antes de excluir.`
    );
  }

  await prisma.wBSNode.update({
    where: { id: node.id },
    data: { deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId },
  });

  await audit(input, node.projectId, "DELETE", {
    objectId: node.id,
    oldValue: { code: node.code, name: node.name },
  });

  return { nodeId: node.id };
}

// §74 — duplicar nó e sua subárvore com códigos novos.
export async function duplicateWbsNode(input: ActorContext & { nodeId: string }) {
  const node = await loadLiveNode(input.organizationId, input.nodeId);
  const nodes = await listAllWbsNodes(input.organizationId, node.projectId);
  // busca na árvore achatada: duplicar um nó filho é o caso comum.
  const treeRoot = flattenWbsTree(buildWbsTree(nodes)).find((item) => item.id === node.id);
  if (!treeRoot) {
    throw new AppError("NOT_FOUND", "Nó de WBS não encontrado nesta organização.");
  }

  const base = nextWbsCode(nodes, node.parentId);
  const taken = new Set(nodes.map((item) => item.code));
  const subtree: {
    node: typeof treeRoot;
    newCode: string;
    parentId: string | null;
    parentCode: string | null;
  }[] = [];

  const walk = (
    current: typeof treeRoot,
    parentId: string | null,
    parentCode: string | null,
    relativePath: string
  ) => {
    const newCode = relativePath ? `${base}.${relativePath}` : base;
    if (newCode.length > 32) {
      throw new AppError("VALIDATION_ERROR", "Código gerado na duplicação excede 32 caracteres.");
    }
    if (taken.has(newCode)) {
      throw new AppError("CONFLICT", `Código de WBS "${newCode}" já existe no projeto.`);
    }
    taken.add(newCode);
    subtree.push({ node: current, newCode, parentId, parentCode });
    for (const child of current.children) {
      const relative = child.path.slice(treeRoot.path.length + 1);
      walk(child, null, newCode, relative);
    }
  };
  walk(treeRoot, node.parentId, null, "");

  const createdIds = new Map<string, string>();

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const item of subtree) {
      const parentId = item.parentCode ? (createdIds.get(item.parentCode) ?? null) : item.parentId;
      const row = await tx.wBSNode.create({
        data: {
          organizationId: input.organizationId,
          projectId: node.projectId,
          parentId,
          code: item.newCode,
          name: item.node.name,
          description: item.node.description ?? null,
          nodeType: toNodeType(item.node.nodeType),
          orderIndex: item.node.orderIndex,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
      });
      createdIds.set(item.newCode, row.id);
      rows.push(row);
    }
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: node.projectId,
        objectType: "WBSNode",
        objectId: rows[0]?.id ?? null,
        action: "DUPLICATE",
        oldValue: { code: node.code },
        newValue: { codes: rows.map((row) => row.code), count: rows.length },
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
    return rows;
  });

  return { rootId: created[0]?.id, nodes: created };
}

// E05-US05 — snapshot versionado da árvore.
export async function createWbsVersion(
  input: ActorContext & { projectId: string; note?: string }
) {
  const project = await assertWbsProject(input.organizationId, input.projectId);
  const tree = await getWbsTree(input.organizationId, input.projectId);
  const document = buildWbsExport(tree, { code: project.code, name: project.name });

  const last = await prisma.wBSVersion.findFirst({
    where: { organizationId: input.organizationId, projectId: input.projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = await prisma.wBSVersion.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      version: (last?.version ?? 0) + 1,
      source: "MANUAL",
      note: input.note?.trim() || null,
      snapshot: { nodes: document.nodes } as never,
      createdBy: input.actorId,
    },
  });

  await audit(input, input.projectId, "VERSION", {
    objectId: null,
    newValue: { version: version.version, note: version.note },
  });

  return version;
}

// E05-US03 — importação com validação, relatório de erros e preservação do
// payload original (§0.1 regra 18). A árvore atual é snapshotada antes.
export async function importWbsTree(
  input: ActorContext & { projectId: string; nodes: WbsImportNode[]; note?: string }
) {
  const project = await assertWbsProject(input.organizationId, input.projectId);
  const existing = await listAllWbsNodes(input.organizationId, input.projectId);

  const result = validateWbsImport(existing, input.nodes);
  if (!result.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Importação inválida: ${result.errors.length} erro(s) encontrado(s).`,
      { details: { errors: result.errors, received: input.nodes } }
    );
  }

  const before = buildWbsExport(buildWbsTree(existing), {
    code: project.code,
    name: project.name,
  });

  const summary = await prisma.$transaction(async (tx) => {
    const idByCode = new Map(existing.map((node) => [node.code, node.id]));
    let createdCount = 0;
    let updatedCount = 0;
    let resurrectedCount = 0;

    let pending = [...result.plan.upserts];
    let progress = pending.length > 0;
    while (pending.length > 0 && progress) {
      progress = false;
      const remaining: typeof pending = [];

      for (const upsert of pending) {
        const resolvesParent =
          upsert.parentCode === undefined ||
          upsert.parentCode === null ||
          idByCode.has(upsert.parentCode);
        if (!resolvesParent) {
          remaining.push(upsert);
          continue;
        }

        const parentId =
          upsert.parentCode === undefined
            ? undefined
            : upsert.parentCode
              ? (idByCode.get(upsert.parentCode) ?? null)
              : null;

        if (upsert.existingId) {
          await tx.wBSNode.update({
            where: { id: upsert.existingId },
            data: {
              name: upsert.name,
              description: upsert.description,
              nodeType: upsert.nodeType,
              orderIndex: upsert.orderIndex,
              ...(parentId !== undefined ? { parentId } : {}),
              ...(upsert.resurrect ? { deletedAt: null, deletedBy: null } : {}),
              updatedBy: input.actorId,
              version: { increment: 1 },
            },
          });
          if (upsert.resurrect) resurrectedCount += 1;
          else updatedCount += 1;
        } else {
          const row = await tx.wBSNode.create({
            data: {
              organizationId: input.organizationId,
              projectId: input.projectId,
              parentId: parentId ?? null,
              code: upsert.code,
              name: upsert.name,
              description: upsert.description,
              nodeType: upsert.nodeType,
              orderIndex: upsert.orderIndex,
              createdBy: input.actorId,
              updatedBy: input.actorId,
            },
          });
          idByCode.set(upsert.code, row.id);
          createdCount += 1;
        }

        progress = true;
      }

      pending = remaining;
    }

    if (pending.length > 0) {
      throw new AppError("VALIDATION_ERROR", "Importação inválida: dependências de pai irresolvíveis.", {
        details: { errors: pending.map((upsert) => `Código "${upsert.code}": pai "${upsert.parentCode}" não pôde ser resolvido.`) },
      });
    }

    const last = await tx.wBSVersion.findFirst({
      where: { organizationId: input.organizationId, projectId: input.projectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = await tx.wBSVersion.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        version: (last?.version ?? 0) + 1,
        source: "IMPORT",
        note: input.note?.trim() || null,
        snapshot: { nodes: before.nodes } as never,
        rawPayload: { nodes: input.nodes } as never,
        createdBy: input.actorId,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        projectId: input.projectId,
        objectType: "WBSNode",
        objectId: null,
        action: "IMPORT",
        newValue: { createdCount, updatedCount, resurrectedCount, version: version.version },
        reason: input.note?.trim() || null,
        correlationId: input.correlationId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });

    await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: "Wbs.Imported",
        aggregateType: "WBSNode",
        aggregateId: input.projectId,
        payload: { createdCount, updatedCount, resurrectedCount },
      },
    });

    return { createdCount, updatedCount, resurrectedCount, version: version.version };
  });

  return summary;
}
