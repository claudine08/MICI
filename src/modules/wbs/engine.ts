// Motor puro da árvore de WBS (E05, §74).
// Funções sem I/O — validação de estrutura, numeração, reordenação e plano de
// importação; serviços orquestram Prisma/auditoria.

export const WBS_NODE_TYPES = ["SUMMARY", "DELIVERABLE", "WORK_PACKAGE"] as const;

export type WbsNodeTypeValue = (typeof WBS_NODE_TYPES)[number];

export const WBS_NODE_TYPE_LABELS: Record<WbsNodeTypeValue, string> = {
  SUMMARY: "Resumo",
  DELIVERABLE: "Entregável",
  WORK_PACKAGE: "Pacote de trabalho",
};

// Profundidade máxima da árvore (raiz = 0).
export const WBS_MAX_DEPTH = 12;

export interface WbsNodeLite {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  orderIndex: number;
  description?: string | null;
  nodeType?: string;
  deletedAt?: Date | null;
}

export interface WbsTreeNode extends WbsNodeLite {
  depth: number;
  path: string;
  children: WbsTreeNode[];
}

function isLive(node: WbsNodeLite): boolean {
  return !node.deletedAt;
}

function compareSiblings(a: WbsNodeLite, b: WbsNodeLite): number {
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return a.code.localeCompare(b.code, "pt-BR", { numeric: true });
}

// O código de um nó pode já conter o caminho completo ("1.1.1"); nesse caso o
// segmento é o resto em relação ao pai. Código fora do padrão é segmento puro.
function segmentOf(code: string, parentPath: string): string {
  if (parentPath && code.startsWith(`${parentPath}.`)) {
    return code.slice(parentPath.length + 1);
  }
  return code;
}

// Monta a árvore a partir da lista plana. Órfãos (pai inexistente/apagado)
// viram raízes — nunca perdem dados por causa de um vínculo quebrado.
export function buildWbsTree(nodes: readonly WbsNodeLite[]): WbsTreeNode[] {
  const live = nodes.filter(isLive);
  const byId = new Map(live.map((node) => [node.id, node]));
  const childrenOf = new Map<string | null, WbsNodeLite[]>();
  for (const node of live) {
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    const bucket = childrenOf.get(parent) ?? [];
    bucket.push(node);
    childrenOf.set(parent, bucket);
  }

  const build = (parentId: string | null, depth: number, prefix: string): WbsTreeNode[] => {
    const siblings = [...(childrenOf.get(parentId) ?? [])].sort(compareSiblings);
    return siblings.map((node) => {
      const segment = segmentOf(node.code, prefix);
      const path = prefix ? `${prefix}.${segment}` : node.code;
      return {
        ...node,
        parentId, // órfãos são normalizados para a raiz
        depth,
        path,
        children: build(node.id, depth + 1, path),
      };
    });
  };

  return build(null, 0, "");
}

export function flattenWbsTree(roots: readonly WbsTreeNode[]): WbsTreeNode[] {
  const rows: WbsTreeNode[] = [];
  const walk = (nodes: readonly WbsTreeNode[]) => {
    for (const node of nodes) {
      rows.push(node);
      walk(node.children);
    }
  };
  walk(roots);
  return rows;
}

export function nodeDepth(nodeId: string, nodes: readonly WbsNodeLite[]): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let depth = 0;
  let current = byId.get(nodeId);
  const seen = new Set<string>();
  while (current?.parentId) {
    if (seen.has(current.id)) return depth;
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

// Visita tolerante a ciclo (o motor recebe dados importados) e a grafos
// com mais de um caminho até o mesmo nó.
export function descendantIds(nodeId: string, nodes: readonly WbsNodeLite[]): string[] {
  const byParent = new Map<string | null, string[]>();
  for (const node of nodes) {
    const bucket = byParent.get(node.parentId) ?? [];
    bucket.push(node.id);
    byParent.set(node.parentId, bucket);
  }
  const result: string[] = [];
  const visited = new Set<string>();
  const stack = [...(byParent.get(nodeId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    result.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return result;
}

// Um nó não pode ser movido para dentro de si mesmo nem de um descendente.
export function wouldCreateCycle(
  nodeId: string,
  newParentId: string | null,
  nodes: readonly WbsNodeLite[]
): boolean {
  if (!newParentId) return false;
  if (newParentId === nodeId) return true;
  return descendantIds(nodeId, nodes).includes(newParentId);
}

export function nodeDepthIfMoved(
  nodeId: string,
  newParentId: string | null,
  nodes: readonly WbsNodeLite[]
): number {
  const parentDepth = newParentId ? nodeDepth(newParentId, nodes) : -1;
  const subtree = [nodeId, ...descendantIds(nodeId, nodes)];
  let deepest = parentDepth + 1;
  for (const id of subtree) {
    deepest = Math.max(deepest, parentDepth + 1 + nodeDepth(id, nodes) - nodeDepth(nodeId, nodes));
  }
  return deepest;
}

function numericSuffix(code: string, prefix: string): number | null {
  const expected = prefix ? `${prefix}.` : "";
  if (expected && !code.startsWith(expected)) return null;
  const rest = code.slice(expected.length);
  if (!/^\d{1,6}$/.test(rest)) return null;
  return Number(rest);
}

// Numeração clássica de WBS: 1, 2, 1.1, 1.2, 2.1, … para filhos novos.
export function nextWbsCode(nodes: readonly WbsNodeLite[], parentId: string | null): string {
  const live = nodes.filter(isLive);
  const byId = new Map(live.map((node) => [node.id, node]));
  const parentPath = parentId ? nodePath(parentId, live) : "";
  // O índice único (projectId, code) considera nós apagados — nunca reutilizar
  // código de um nó soft-deleted.
  const taken = new Set(nodes.map((node) => node.code));

  let candidate = 1;
  for (const node of live) {
    const nodeParent = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    if (nodeParent !== parentId) continue;
    const suffix = numericSuffix(node.code, parentPath);
    if (suffix !== null) candidate = Math.max(candidate, suffix + 1);
  }

  let code = parentPath ? `${parentPath}.${candidate}` : String(candidate);
  while (taken.has(code)) {
    candidate += 1;
    code = parentPath ? `${parentPath}.${candidate}` : String(candidate);
  }
  return code;
}

export function nodePath(nodeId: string, nodes: readonly WbsNodeLite[]): string {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: WbsNodeLite[] = [];
  const seen = new Set<string>();
  let current = byId.get(nodeId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  // Mesma regra do buildWbsTree: código que já codifica o caminho não é
  // recomposto ("1.1" sob "1" mantém "1.1", não vira "1.1.1").
  let path = "";
  for (const node of chain) {
    const segment = segmentOf(node.code, path);
    path = path ? `${path}.${segment}` : node.code;
  }
  return path;
}

export function nextSiblingOrder(
  nodes: readonly WbsNodeLite[],
  parentId: string | null
): number {
  const live = nodes.filter(isLive);
  const ids = new Set(live.map((node) => node.id));
  const orders = live
    .filter((node) => (node.parentId && ids.has(node.parentId) ? node.parentId : null) === parentId)
    .map((node) => node.orderIndex);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

// ---------------------------------------------------------------------------
// Reordenação entre irmãos (E05-US02)
// ---------------------------------------------------------------------------

export type ReorderPlan =
  | { ok: true; updates: { id: string; orderIndex: number }[] }
  | { ok: false; error: string };

export function planReorder(
  nodes: readonly WbsNodeLite[],
  parentId: string | null,
  orderedIds: readonly string[]
): ReorderPlan {
  const live = nodes.filter(isLive);
  const parentExists = parentId === null || live.some((node) => node.id === parentId);
  if (!parentExists) {
    return { ok: false, error: "Pai inválido: nó não existe nesta árvore." };
  }

  const current = live.filter((node) => {
    const effectiveParent = node.parentId && live.some((p) => p.id === node.parentId) ? node.parentId : null;
    return effectiveParent === parentId;
  });
  const currentIds = new Set(current.map((node) => node.id));
  const orderedSet = new Set(orderedIds);

  if (orderedSet.size !== orderedIds.length) {
    return { ok: false, error: "Ordem inválida: nó repetido na sequência." };
  }
  if (orderedIds.length !== currentIds.size || [...currentIds].some((id) => !orderedSet.has(id))) {
    return {
      ok: false,
      error: "Ordem inválida: a lista deve conter exatamente os nós irmãos informados.",
    };
  }

  return {
    ok: true,
    updates: orderedIds.map((id, index) => ({ id, orderIndex: index })),
  };
}

// ---------------------------------------------------------------------------
// Importação (E05-US03, §0.1 regra 18 — validar, reportar erros, preservar)
// ---------------------------------------------------------------------------

export interface WbsImportNode {
  code: string;
  name: string;
  description?: string | null;
  nodeType?: WbsNodeTypeValue;
  parentCode?: string | null;
  orderIndex?: number;
}

export interface WbsImportUpsert {
  code: string;
  name: string;
  description: string | null;
  nodeType: WbsNodeTypeValue;
  // undefined → preservar o pai atual (nó existente); null → raiz.
  parentCode: string | null | undefined;
  orderIndex: number;
  needsOrder: boolean;
  existingId: string | null;
  resurrect: boolean;
}

export interface WbsImportPlan {
  upserts: WbsImportUpsert[];
  finalNodes: WbsNodeLite[];
}

export type WbsImportResult =
  | { ok: true; plan: WbsImportPlan }
  | { ok: false; errors: string[] };

function isNodeType(value: unknown): value is WbsNodeTypeValue {
  return typeof value === "string" && (WBS_NODE_TYPES as readonly string[]).includes(value);
}

export function validateWbsImport(
  existing: readonly WbsNodeLite[],
  incoming: readonly WbsImportNode[]
): WbsImportResult {
  const errors: string[] = [];
  if (incoming.length === 0) {
    return { ok: false, errors: ["Payload vazio: nenhum nó recebido."] };
  }

  const seen = new Set<string>();
  incoming.forEach((node, index) => {
    const code = node.code?.trim();
    if (!code) {
      errors.push(`Nó #${index + 1}: código ausente.`);
      return;
    }
    if (seen.has(code)) errors.push(`Código duplicado no payload: "${code}".`);
    seen.add(code);
    if (!node.name?.trim()) errors.push(`Código "${code}": nome ausente.`);
    if (node.nodeType !== undefined && !isNodeType(node.nodeType)) {
      errors.push(`Código "${code}": tipo inválido "${String(node.nodeType)}".`);
    }
  });
  if (errors.length > 0) return { ok: false, errors };

  const existingByCode = new Map(existing.map((node) => [node.code, node]));
  const incomingByCode = new Map(incoming.map((node) => [node.code.trim(), node]));

  // Pai deve existir no payload ou na árvore atual (e não ser apagado).
  for (const node of incoming) {
    const code = node.code.trim();
    const parentCode = node.parentCode?.trim() || null;
    if (!parentCode) continue;
    if (parentCode === code) {
      errors.push(`Código "${code}": um nó não pode ser pai de si mesmo.`);
      continue;
    }
    const inPayload = incomingByCode.has(parentCode);
    const inTree = existingByCode.get(parentCode);
    if (!inPayload && !inTree) {
      errors.push(`Código "${code}": pai "${parentCode}" não existe.`);
    } else if (!inPayload && inTree && !isLive(inTree)) {
      errors.push(`Código "${code}": pai "${parentCode}" está apagado.`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // Nó do payload reaproveita o id existente (inclusive de um nó apagado →
  // ressuscitado); nós ausentes do payload mantêm o estado atual.
  const upserts: WbsImportUpsert[] = incoming.map((node) => {
    const code = node.code.trim();
    const current = existingByCode.get(code);
    const parentCode = node.parentCode?.trim();
    return {
      code,
      name: node.name.trim(),
      description: node.description?.trim() || null,
      nodeType: isNodeType(node.nodeType) ? node.nodeType : (current ? "WORK_PACKAGE" : "SUMMARY"),
      parentCode: node.parentCode === undefined ? undefined : parentCode || null,
      orderIndex: node.orderIndex ?? current?.orderIndex ?? 0,
      needsOrder: node.orderIndex === undefined && !current,
      existingId: current ? current.id : null,
      resurrect: Boolean(current && !isLive(current)),
    };
  });

  const upsertByCode = new Map(upserts.map((upsert) => [upsert.code, upsert]));
  const finalNodes: WbsNodeLite[] = [];
  const idByCode = new Map<string, string>();

  for (const node of existing) {
    const upsert = upsertByCode.get(node.code);
    if (upsert) continue;
    if (!isLive(node)) continue;
    finalNodes.push(node);
    idByCode.set(node.code, node.id);
  }
  for (const upsert of upserts) {
    const id = upsert.existingId ?? `new:${upsert.code}`;
    idByCode.set(upsert.code, id);
    finalNodes.push({
      id,
      parentId: null, // resolvido abaixo via parentCode
      code: upsert.code,
      name: upsert.name,
      orderIndex: upsert.orderIndex,
      deletedAt: null,
    });
  }

  // Resolve parents: payload manda; parentCode ausente preserva o pai atual.
  const resolved = finalNodes.map((node) => {
    const upsert = upsertByCode.get(node.code);
    if (!upsert) return node;
    if (upsert.parentCode === undefined) {
      const current = existingByCode.get(node.code);
      return { ...node, parentId: current?.parentId ?? null };
    }
    if (!upsert.parentCode) return { ...node, parentId: null };
    return { ...node, parentId: idByCode.get(upsert.parentCode) ?? null };
  });

  // Nós novos sem ordem explícita são anexados ao fim dos irmãos.
  const needsOrderCodes = new Set(upserts.filter((u) => u.needsOrder).map((u) => u.code));
  if (needsOrderCodes.size > 0) {
    const groups = new Map<string | null, WbsNodeLite[]>();
    for (const node of resolved) {
      const bucket = groups.get(node.parentId) ?? [];
      bucket.push(node);
      groups.set(node.parentId, bucket);
    }
    for (const group of groups.values()) {
      const fixed = group.filter((node) => !needsOrderCodes.has(node.code));
      let next = fixed.length === 0 ? 0 : Math.max(...fixed.map((node) => node.orderIndex)) + 1;
      for (const node of group) {
        if (needsOrderCodes.has(node.code)) node.orderIndex = next++;
      }
    }
  }

  for (const node of resolved) {
    if (node.parentId && wouldCreateCycle(node.id, node.parentId, resolved)) {
      errors.push(`Código "${node.code}": movimento cria ciclo na árvore.`);
    }
    const depth = nodeDepth(node.id, resolved);
    if (depth >= WBS_MAX_DEPTH) {
      errors.push(
        `Código "${node.code}": profundidade máxima de ${WBS_MAX_DEPTH} níveis excedida.`
      );
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, plan: { upserts, finalNodes: resolved } };
}

// ---------------------------------------------------------------------------
// Exportação (E05-US04)
// ---------------------------------------------------------------------------

export interface WbsExportDocument {
  format: "micI.wbs/1";
  project: { code: string; name: string };
  exportedAt: string;
  nodes: {
    code: string;
    name: string;
    description: string | null;
    nodeType: string;
    parentCode: string | null;
    orderIndex: number;
    path: string;
  }[];
}

export function buildWbsExport(
  roots: readonly WbsTreeNode[],
  project: { code: string; name: string },
  exportedAt: Date = new Date()
): WbsExportDocument {
  const byId = new Map<string, WbsTreeNode>();
  for (const node of flattenWbsTree(roots)) byId.set(node.id, node);

  return {
    format: "micI.wbs/1",
    project,
    exportedAt: exportedAt.toISOString(),
    nodes: flattenWbsTree(roots).map((node) => ({
      code: node.code,
      name: node.name,
      description: node.description ?? null,
      nodeType: node.nodeType ?? "WORK_PACKAGE",
      parentCode: node.parentId ? (byId.get(node.parentId)?.code ?? null) : null,
      orderIndex: node.orderIndex,
      path: node.path,
    })),
  };
}

export function wbsToCsv(roots: readonly WbsTreeNode[]): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = ["path;code;name;type;depth;order"];
  for (const node of flattenWbsTree(roots)) {
    lines.push(
      [node.path, node.code, node.name, node.nodeType ?? "WORK_PACKAGE", node.depth, node.orderIndex]
        .map(escape)
        .join(";")
    );
  }
  return lines.join("\n");
}
