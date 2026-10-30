// Suprimentos (E14, §49, E14-US01..US03): Fornecedores, Requisição de Compra,
// Cotações e Mapa Comparativo.
// Estados reais em Postgres + isolamento de tenant.

import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import {
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "@/modules/procurement/suppliers";
import {
  createPurchaseRequest,
  transitionPurchaseRequestStatus,
  deletePurchaseRequest,
} from "@/modules/procurement/requests";
import {
  createQuotation,
  updateQuotation,
  transitionQuotationStatus,
} from "@/modules/procurement/quotations";
import {
  createOrUpdateBidComparison,
  completeBidComparison,
} from "@/modules/procurement/comparisons";
import {
  listSuppliers,
  getPurchaseRequestById,
  getProcurementBoard,
} from "@/modules/procurement/selectors";

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
    data: { email: `proc-a-${suffix}@test.local`, name: "Procurement A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `proc-b-${suffix}@test.local`, name: "Procurement B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org Proc A ${suffix}`,
    slug: `proc-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org Proc B ${suffix}`,
    slug: `proc-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-PROC-${suffix.toUpperCase()}`,
    name: "Projeto Suprimentos Teste",
  });
  projectId = project.id;

  const otherProject = await createProject({
    ...actorB(),
    code: `PRJ-OTHER-${suffix.toUpperCase()}`,
    name: "Outro Projeto Org B",
  });
  otherProjectId = otherProject.id;
  expect(otherProjectId).toBeDefined();
});

describe("Procurement Integration (E14)", () => {
  let supplier1Id: string;
  let supplier2Id: string;
  let requestId: string;
  let quotation1Id: string;
  let quotation2Id: string;

  describe("1. Fornecedores (Supplier)", () => {
    it("cria fornecedor gerando código sequencial SP001", async () => {
      const supplier = await createSupplier(
        {
          name: "Distribuidora de Aço Brasil Ltda",
          tradeName: "Aço Brasil",
          taxId: "12.345.678/0001-90",
          category: "MATERIAIS",
          email: "vendas@acobrasil.com.br",
          phone: "(11) 98765-4321",
        },
        actorA()
      );

      expect(supplier.id).toBeDefined();
      expect(supplier.code).toBe("SP001");
      expect(supplier.status).toBe("ACTIVE");
      supplier1Id = supplier.id;
    });

    it("idempotência com clientUuid reutiliza fornecedor criado", async () => {
      const clientUuid = randomUUID();
      const s1 = await createSupplier(
        {
          name: "Cimentos Montes Claros",
          category: "MATERIAIS",
          clientUuid,
        },
        actorA()
      );
      expect(s1.code).toBe("SP002");
      supplier2Id = s1.id;

      const s2 = await createSupplier(
        {
          name: "Cimentos Montes Claros (Replay)",
          clientUuid,
        },
        actorA()
      );
      expect(s2.id).toBe(s1.id);
      expect(s2.code).toBe("SP002");
    });

    it("respeita isolamento de tenant entre organizações", async () => {
      const listA = await listSuppliers(orgA.id);
      expect(listA.length).toBeGreaterThanOrEqual(2);

      const listB = await listSuppliers(orgB.id);
      expect(listB.length).toBe(0);
    });

    it("atualiza metadados e status do fornecedor", async () => {
      const updated = await updateSupplier(
        supplier1Id,
        {
          phone: "(11) 99999-8888",
          notes: "Fornecedor homologado para estruturas metálicas",
        },
        actorA()
      );
      expect(updated.phone).toBe("(11) 99999-8888");
      expect(updated.notes).toContain("homologado");
    });
  });

  describe("2. Requisição de Compra (PurchaseRequest)", () => {
    it("cria requisição com itens gerando código PR001", async () => {
      const request = await createPurchaseRequest(
        projectId,
        {
          title: "Aquisição de Aço CA-50 para fundações",
          description: "Aço para armação dos blocos de coroamento",
          priority: "HIGH",
          costCenter: "CC-FUNDACOES",
          items: [
            {
              description: "Barra de Aço CA-50 10.0mm",
              quantity: 500,
              unit: "kg",
              estimatedUnitPrice: 6.5,
            },
            {
              description: "Barra de Aço CA-50 12.5mm",
              quantity: 800,
              unit: "kg",
              estimatedUnitPrice: 6.8,
            },
          ],
        },
        actorA()
      );

      expect(request.id).toBeDefined();
      expect(request.code).toBe("PR001");
      expect(request.status).toBe("DRAFT");
      expect(request.items).toHaveLength(2);
      expect(Number(request.items[0].estimatedTotalPrice)).toBe(3250); // 500 * 6.5
      requestId = request.id;
    });

    it("idempotência com clientUuid em requisições de compra", async () => {
      const clientUuid = randomUUID();
      const req1 = await createPurchaseRequest(
        projectId,
        {
          title: "Locação de Andaimes Fachadeiros",
          items: [{ description: "Andaime", quantity: 10, unit: "un" }],
          clientUuid,
        },
        actorA()
      );
      expect(req1.code).toBe("PR002");

      const req2 = await createPurchaseRequest(
        projectId,
        {
          title: "Locação de Andaimes Fachadeiros (Replay)",
          items: [{ description: "Andaime", quantity: 10, unit: "un" }],
          clientUuid,
        },
        actorA()
      );
      expect(req2.id).toBe(req1.id);
    });

    it("rejeita criação em projeto de outra organização", async () => {
      await expectAppError(
        createPurchaseRequest(
          projectId,
          {
            title: "Tentativa Invasiva",
            items: [{ description: "Item", quantity: 1, unit: "un" }],
          },
          actorB()
        ),
        "NOT_FOUND"
      );
    });

    it("transição de status: SUBMIT avança DRAFT para SUBMITTED", async () => {
      const updated = await transitionPurchaseRequestStatus(
        projectId,
        requestId,
        { action: "SUBMIT" },
        actorA()
      );
      expect(updated.status).toBe("SUBMITTED");
    });
  });

  describe("3. Cotações (Quotation)", () => {
    it("cria cotação para o Fornecedor 1 e avança requisição para QUOTING", async () => {
      const quotation = await createQuotation(
        projectId,
        {
          requestId,
          supplierId: supplier1Id,
          leadTimeDays: 7,
          paymentTerms: "28 DDL",
          shippingCost: 150,
          discount: 50,
          items: [
            {
              description: "Barra de Aço CA-50 10.0mm Gerdau",
              quantity: 500,
              unit: "kg",
              unitPrice: 6.2, // 3100
            },
            {
              description: "Barra de Aço CA-50 12.5mm Gerdau",
              quantity: 800,
              unit: "kg",
              unitPrice: 6.4, // 5120
            },
          ],
        },
        actorA()
      );

      expect(quotation.id).toBeDefined();
      expect(quotation.code).toBe("QT001");
      expect(quotation.status).toBe("DRAFT");
      expect(Number(quotation.totalAmount)).toBe(8320); // 3100 + 5120 + 150 - 50 = 8320
      quotation1Id = quotation.id;

      // Requisição deve ter avançado para QUOTING
      const req = await getPurchaseRequestById(projectId, requestId);
      expect(req?.status).toBe("QUOTING");
    });

    it("cria segunda cotação para o Fornecedor 2 (mais barata e mais rápida)", async () => {
      const quotation = await createQuotation(
        projectId,
        {
          requestId,
          supplierId: supplier2Id,
          leadTimeDays: 5,
          paymentTerms: "30 DDL",
          shippingCost: 0,
          discount: 0,
          items: [
            {
              description: "Barra de Aço CA-50 10.0mm Arcelor",
              quantity: 500,
              unit: "kg",
              unitPrice: 6.0, // 3000
            },
            {
              description: "Barra de Aço CA-50 12.5mm Arcelor",
              quantity: 800,
              unit: "kg",
              unitPrice: 6.2, // 4960
            },
          ],
        },
        actorA()
      );

      expect(quotation.code).toBe("QT002");
      expect(Number(quotation.totalAmount)).toBe(7960); // 3000 + 4960 = 7960
      quotation2Id = quotation.id;
    });

    it("submete ambas as cotações para avaliação", async () => {
      const q1 = await transitionQuotationStatus(
        projectId,
        quotation1Id,
        { action: "SUBMIT" },
        actorA()
      );
      expect(q1.status).toBe("SUBMITTED");

      const q2 = await transitionQuotationStatus(
        projectId,
        quotation2Id,
        { action: "SUBMIT" },
        actorA()
      );
      expect(q2.status).toBe("SUBMITTED");
    });

    it("bloqueia edição após cotação submetida", async () => {
      await expectAppError(
        updateQuotation(
          projectId,
          quotation1Id,
          { shippingCost: 200 },
          actorA()
        ),
        "PROCUREMENT_INVALID_STATE"
      );
    });
  });

  describe("4. Mapa Comparativo (BidComparison) e Conclusão", () => {
    it("gera rascunho de mapa comparativo BC001 com identificação de menor preço", async () => {
      const comparison = await createOrUpdateBidComparison(
        projectId,
        requestId,
        {},
        actorA()
      );

      expect(comparison.code).toBe("BC001");
      expect(comparison.status).toBe("DRAFT");
      expect(comparison.selectedQuotationId).toBe(quotation2Id); // QT002 é o menor preço (7960 vs 8320)
    });

    it("conclui o mapa comparativo selecionando QT002, desqualificando QT001 e avançando requisição", async () => {
      const completed = await completeBidComparison(
        projectId,
        requestId,
        {
          selectedQuotationId: quotation2Id,
          selectionReason: "Menor preço global (economia de R$ 360,00) e menor prazo de entrega (5 dias).",
        },
        actorA()
      );

      expect(completed.status).toBe("COMPLETED");

      // Cotação 2 deve estar SELECTED
      const q2 = await prisma.quotation.findUnique({ where: { id: quotation2Id } });
      expect(q2?.status).toBe("SELECTED");

      // Cotação 1 deve estar REJECTED
      const q1 = await prisma.quotation.findUnique({ where: { id: quotation1Id } });
      expect(q1?.status).toBe("REJECTED");

      // Requisição deve estar COMPARED
      const req = await getPurchaseRequestById(projectId, requestId);
      expect(req?.status).toBe("COMPARED");
    });

    it("aprova requisição de compra cotada", async () => {
      const approved = await transitionPurchaseRequestStatus(
        projectId,
        requestId,
        { action: "APPROVE", reason: "Valores alinhados com a estimativa do orçamento." },
        actorA()
      );
      expect(approved.status).toBe("APPROVED");
    });
  });

  describe("5. Restrições e Exclusões", () => {
    it("não permite excluir fornecedor com cotações vinculadas", async () => {
      await expectAppError(
        deleteSupplier(supplier1Id, actorA()),
        "CONFLICT"
      );
    });

    it("não permite excluir requisição de compra aprovada", async () => {
      await expectAppError(
        deletePurchaseRequest(projectId, requestId, actorA()),
        "PROCUREMENT_INVALID_STATE"
      );
    });
  });

  describe("6. Resumo e Painel (Board)", () => {
    it("retorna resumo do quadro de suprimentos com métricas corretas", async () => {
      const board = await getProcurementBoard(orgA.id, projectId);

      expect(board.totalRequests).toBeGreaterThanOrEqual(2);
      expect(board.approvedRequests).toBeGreaterThanOrEqual(1);
      expect(board.totalQuotations).toBeGreaterThanOrEqual(2);
      expect(board.selectedQuotations).toBeGreaterThanOrEqual(1);
      expect(board.totalSuppliers).toBeGreaterThanOrEqual(2);
      expect(board.activeSuppliers).toBeGreaterThanOrEqual(2);
    });
  });
});

