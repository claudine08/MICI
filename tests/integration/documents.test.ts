// Documentos do projeto (E09, §36/§61/§92, BR-009/BR-010/BR-011): upload com
// hash, revisões imutáveis, máquina de estados, aprovação auditada, links e
// isolamento de tenant. Estados reais em Postgres (mici_test).

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createClient } from "@/modules/portfolio/clients";
import { createProject } from "@/modules/portfolio/projects";
import { createWbsNode } from "@/modules/wbs/wbs";
import { createCostItem } from "@/modules/cost/items";
import { createDocument, transitionDocument, updateDocument, deleteDocument } from "@/modules/documents/documents";
import { createRevision } from "@/modules/documents/revisions";
import { createDocumentLink, deleteDocumentLink } from "@/modules/documents/links";
import { downloadRevision } from "@/modules/documents/downloads";
import { listDocuments, getDocumentDetail, listDocumentSummaries } from "@/modules/documents/selectors";
import { prepareFileUpload } from "@/modules/documents/storage";

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let projectId: string;
let wbsNodeId: string;
let costItemId: string;

function actorA() {
  return { organizationId: orgA.id, actorId: userA.id, actorLabel: userA.email };
}

function actorB() {
  return { organizationId: orgB.id, actorId: userB.id, actorLabel: userB.email };
}

function filePayload(name = "planta.pdf", content = "conteudo-pdf") {
  const buffer = Buffer.from(content);
  return prepareFileUpload({
    name,
    type: "application/pdf",
    size: buffer.length,
    buffer,
  });
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
    data: { email: `doc-a-${suffix}@test.local`, name: "Doc A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `doc-b-${suffix}@test.local`, name: "Doc B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Doc A ${suffix}`,
    slug: `doc-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Doc B ${suffix}`,
    slug: `doc-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const client = await createClient({
    ...actorA(),
    code: `CLI-${suffix.toUpperCase()}`,
    name: "Cliente Docs",
  });
  const project = await createProject({
    ...actorA(),
    code: `PRJ-${suffix.toUpperCase()}`,
    name: "Projeto Documentos",
    clientId: client.id,
    status: "ACTIVE",
  });
  projectId = project.id;

  const node = await createWbsNode({ ...actorA(), projectId, code: "1", name: "Projeto" });
  wbsNodeId = node.id;

  const item = await createCostItem({
    ...actorA(),
    projectId,
    description: "Serventia",
    category: "Serviços",
    unit: "m3",
    quantity: 1,
    unitPrice: 100,
  });
  costItemId = item.id;
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("upload e criação (E09-US01)", () => {
  it("cria documento com revisão 1, código DOC001 e hash SHA-256", async () => {
    const document = await createDocument({
      ...actorA(),
      projectId,
      title: "Planta baixa",
      discipline: "Arquitetura",
      file: filePayload(),
    });

    expect(document.code).toBe("DOC001");
    expect(document.status).toBe("WIP");
    expect(document.currentRevision).toBe(1);
    expect(document.revisionCount).toBe(1);
    expect(document.currentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(document.currentFileName).toBe("planta.pdf");
  });

  it("gera código automático sequencial DOC002", async () => {
    const document = await createDocument({
      ...actorA(),
      projectId,
      title: "Memorial descritivo",
      file: filePayload("memorial.txt", "texto"),
    });
    expect(document.code).toBe("DOC002");
  });

  it("rejeita MIME fora da allowlist (VALIDATION_ERROR)", async () => {
    const buffer = Buffer.from("exe");
    await expectAppError(
      (async () =>
        createDocument({
          ...actorA(),
          projectId,
          title: "Malicioso",
          file: prepareFileUpload({ name: "virus.exe", type: "application/x-msdownload", size: 3, buffer }),
        }))(),
      "VALIDATION_ERROR"
    );
  });

  it("rejeita arquivo acima do limite (VALIDATION_ERROR)", async () => {
    const big = Buffer.alloc(4 * 1024 * 1024 + 1, 1);
    await expectAppError(
      (async () =>
        createDocument({
          ...actorA(),
          projectId,
          title: "Gigante",
          file: prepareFileUpload({ name: "big.pdf", type: "application/pdf", size: big.length, buffer: big }),
        }))(),
      "VALIDATION_ERROR"
    );
  });

  it("rejeita código duplicado no projeto (CONFLICT)", async () => {
    await createDocument({
      ...actorA(),
      projectId,
      code: "DUP-01",
      title: "Original",
      file: filePayload(),
    });
    await expectAppError(
      createDocument({
        ...actorA(),
        projectId,
        code: "DUP-01",
        title: "Cópia",
        file: filePayload(),
      }),
      "CONFLICT"
    );
  });
});

describe("máquina de estados e revisões (E09-US02/US03/US04, BR-009)", () => {
  let documentId: string;

  beforeAll(async () => {
    const document = await createDocument({
      ...actorA(),
      projectId,
      title: "Ciclo completo",
      file: filePayload("ciclo.pdf"),
    });
    documentId = document.id;
  }, 30000);

  it("SUBMIT WIP → FOR_REVIEW", async () => {
    const doc = await transitionDocument({ ...actorA(), documentId, action: "SUBMIT" });
    expect(doc.status).toBe("FOR_REVIEW");
  });

  it("APPROVE FOR_REVIEW → APPROVED com audit e DocumentApproval (BR-011)", async () => {
    const doc = await transitionDocument({
      ...actorA(),
      documentId,
      action: "APPROVE",
      comment: "Aprovado pelo PMO",
    });
    expect(doc.status).toBe("APPROVED");
    expect(doc.revisions[0].approvedAt).not.toBeNull();

    const approvals = await prisma.documentApproval.findMany({ where: { documentId } });
    expect(approvals.length).toBeGreaterThanOrEqual(1);

    const audits = await prisma.auditEvent.findMany({
      where: { objectId: documentId, action: "APPROVE" },
    });
    expect(audits.length).toBe(1);
  });

  it("RELEASE APPROVED → RELEASED_FOR_EXECUTION com domain event", async () => {
    const doc = await transitionDocument({
      ...actorA(),
      documentId,
      action: "RELEASE",
      effectiveDate: "2026-10-20",
    });
    expect(doc.status).toBe("RELEASED_FOR_EXECUTION");
    expect(doc.effectiveDate).toBe("2026-10-20");

    const events = await prisma.domainEvent.findMany({
      where: { aggregateId: documentId, eventType: "Document.Released" },
    });
    expect(events.length).toBe(1);
  });

  it("BR-009: upload novo em liberado vira nova revisão e volta a WIP", async () => {
    const doc = await createRevision({
      ...actorA(),
      documentId,
      reason: "Ajuste de campo conforme RFI 12",
      file: filePayload("ciclo-v2.pdf", "nova revisao"),
    });
    expect(doc.currentRevision).toBe(2);
    expect(doc.status).toBe("WIP");
    expect(doc.revisionCount).toBe(2);

    // Revisão 1 permanece com o arquivo e hash originais (imutável).
    const rev1 = doc.revisions.find((r) => r.revision === 1)!;
    expect(rev1.fileName).toBe("ciclo.pdf");
    expect(rev1.status).toBe("RELEASED_FOR_EXECUTION");
  });

  it("não permite nova revisão em WIP (DOCUMENT_INVALID_STATE)", async () => {
    await expectAppError(
      createRevision({
        ...actorA(),
        documentId,
        reason: "Prematuro",
        file: filePayload("x.pdf"),
      }),
      "DOCUMENT_INVALID_STATE"
    );
  });

  it("não permite edição de metadados após aprovação (DOCUMENT_IMMUTABLE)", async () => {
    await transitionDocument({ ...actorA(), documentId, action: "SUBMIT" });
    await transitionDocument({ ...actorA(), documentId, action: "APPROVE" });
    await expectAppError(
      updateDocument({ ...actorA(), documentId, title: "Novo título" }),
      "DOCUMENT_IMMUTABLE"
    );
  });

  it("REJECT FOR_REVIEW → WIP exige motivo", async () => {
    const document = await createDocument({
      ...actorA(),
      projectId,
      title: "Para rejeitar",
      file: filePayload("rej.pdf"),
    });
    await transitionDocument({ ...actorA(), documentId: document.id, action: "SUBMIT" });
    await expectAppError(
      transitionDocument({ ...actorA(), documentId: document.id, action: "REJECT" }),
      "VALIDATION_ERROR"
    );
    const doc = await transitionDocument({
      ...actorA(),
      documentId: document.id,
      action: "REJECT",
      reason: "Falta carimbo",
    });
    expect(doc.status).toBe("WIP");
  });

  it("delete bloqueado em liberado; delete OK em WIP (BR-010)", async () => {
    const document = await createDocument({
      ...actorA(),
      projectId,
      title: "Descartável",
      file: filePayload("desc.pdf"),
    });
    await deleteDocument({ ...actorA(), documentId: document.id });
    const detail = await getDocumentDetail(orgA.id, document.id).catch(() => null);
    expect(detail).toBeNull();
  });
});

describe("links de objetos (E09-US05, §92)", () => {
  let documentId: string;

  beforeAll(async () => {
    const document = await createDocument({
      ...actorA(),
      projectId,
      title: "Doc com links",
      file: filePayload("links.pdf"),
    });
    documentId = document.id;
  }, 30000);

  it("cria link documento → WBS e documento → item de custo", async () => {
    const wbsLink = await createDocumentLink({
      ...actorA(),
      documentId,
      targetType: "WBS_NODE",
      targetId: wbsNodeId,
      relationType: "SATISFIES",
    });
    expect(wbsLink.link.relationType).toBe("SATISFIES");

    await createDocumentLink({
      ...actorA(),
      documentId,
      targetType: "COST_ITEM",
      targetId: costItemId,
      relationType: "EVIDENCES",
    });

    const detail = await getDocumentDetail(orgA.id, documentId);
    expect(detail.links.length).toBe(2);
  });

  it("link duplicado dá CONFLICT", async () => {
    await expectAppError(
      createDocumentLink({
        ...actorA(),
        documentId,
        targetType: "WBS_NODE",
        targetId: wbsNodeId,
        relationType: "SATISFIES",
      }),
      "CONFLICT"
    );
  });

  it("alvo de outro tenant dá VALIDATION_ERROR", async () => {
    await expectAppError(
      createDocumentLink({
        ...actorA(),
        documentId,
        targetType: "WBS_NODE",
        targetId: "00000000-0000-4000-8000-000000000000",
        relationType: "RELATED_TO",
      }),
      "VALIDATION_ERROR"
    );
  });

  it("remove link e audita UNLINK", async () => {
    const detail = await getDocumentDetail(orgA.id, documentId);
    const link = detail.links[0];
    await deleteDocumentLink({ ...actorA(), documentId, linkId: link.id });
    const after = await getDocumentDetail(orgA.id, documentId);
    expect(after.links.length).toBe(detail.links.length - 1);
  });
});

describe("download e auditoria (§120)", () => {
  it("download devolve o conteúdo e grava AuditEvent DOWNLOAD", async () => {
    const document = await createDocument({
      ...actorA(),
      projectId,
      title: "Doc download",
      file: filePayload("down.pdf", "conteudo-original"),
    });
    const detail = await getDocumentDetail(orgA.id, document.id);
    const revisionId = detail.revisions[0].id;

    const file = await downloadRevision({
      ...actorA(),
      documentId: document.id,
      revisionId,
    });
    expect(file.fileName).toBe("down.pdf");
    expect(file.content.toString()).toBe("conteudo-original");
    expect(file.hash).toMatch(/^[0-9a-f]{64}$/);

    const audits = await prisma.auditEvent.findMany({
      where: { objectId: revisionId, action: "DOWNLOAD" },
    });
    expect(audits.length).toBe(1);
  });
});

describe("listagens e isolamento de tenant (BR-013)", () => {
  it("listDocuments e summaries só enxergam o próprio tenant", async () => {
    const docs = await listDocuments(orgA.id, projectId);
    expect(docs.length).toBeGreaterThan(0);

    const summaries = await listDocumentSummaries(orgA.id);
    const summary = summaries.find((row) => row.projectId === projectId);
    expect(summary).toBeTruthy();
    expect(summary!.documentCount).toBeGreaterThan(0);

    await expectAppError(listDocuments(orgB.id, projectId), "NOT_FOUND");
  });

  it("detail de outro tenant dá NOT_FOUND", async () => {
    const docs = await listDocuments(orgA.id, projectId);
    await expectAppError(getDocumentDetail(orgB.id, docs[0].id), "NOT_FOUND");
  });

  it("transition de outro tenant dá NOT_FOUND", async () => {
    const docs = await listDocuments(orgA.id, projectId);
    const wip = docs.find((d) => d.status === "WIP") ?? docs[0];
    await expectAppError(
      transitionDocument({ ...actorB(), documentId: wip.id, action: "SUBMIT" }),
      "NOT_FOUND"
    );
  });
});
