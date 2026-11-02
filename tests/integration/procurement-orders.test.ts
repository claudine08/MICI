// Suprimentos (E14, Fatia 2): Pedido de Compra (PO) e Recebimento (GR).
// Estados reais em Postgres + isolamento de tenant.

import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { AppError } from "@/core/errors";
import { createOrganization } from "@/modules/identity/services";
import { createProject } from "@/modules/portfolio/projects";
import { createSupplier } from "@/modules/procurement/suppliers";
import {
  createPurchaseRequest,
  transitionPurchaseRequestStatus,
} from "@/modules/procurement/requests";
import {
  createPurchaseOrder,
  transitionPurchaseOrderStatus,
  deletePurchaseOrder,
  updatePurchaseOrder,
} from "@/modules/procurement/purchase-orders";
import {
  createGoodsReceipt,
  confirmGoodsReceipt,
  deleteGoodsReceipt,
} from "@/modules/procurement/goods-receipts";
import {
  getPurchaseOrderById,
  listPurchaseOrders,
  listGoodsReceipts,
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
    data: { email: `po-a-${suffix}@test.local`, name: "PO A", passwordHash },
  });
  userB = await prisma.user.create({
    data: { email: `po-b-${suffix}@test.local`, name: "PO B", passwordHash },
  });

  orgA = await createOrganization({
    name: `Org PO A ${suffix}`,
    slug: `po-a-${suffix}`,
    actorId: userA.id,
    actorEmail: userA.email,
  });
  orgB = await createOrganization({
    name: `Org PO B ${suffix}`,
    slug: `po-b-${suffix}`,
    actorId: userB.id,
    actorEmail: userB.email,
  });

  const project = await createProject({
    ...actorA(),
    code: `PRJ-PO-${suffix.toUpperCase()}`,
    name: "Projeto PO Teste",
  });
  projectId = project.id;

  const otherProject = await createProject({
    ...actorB(),
    code: `PRJ-POO-${suffix.toUpperCase()}`,
    name: "Outro Projeto Org B",
  });
  otherProjectId = otherProject.id;
});

describe("Procurement Fatia 2 — PO e Recebimento (E14)", () => {
  let supplierId: string;
  let requestId: string;
  let orderId: string;
  let receiptId: string;

  beforeAll(async () => {
    const supplier = await createSupplier(
      { name: "Fornecedor PO Teste", category: "MATERIAIS" },
      actorA()
    );
    supplierId = supplier.id;

    const request = await createPurchaseRequest(
      projectId,
      {
        title: "Requisição para PO",
        items: [
          { description: "Item A", quantity: 10, unit: "un", estimatedUnitPrice: 5 },
          { description: "Item B", quantity: 4, unit: "un", estimatedUnitPrice: 2.5 },
        ],
      },
      actorA()
    );
    requestId = request.id;

    await transitionPurchaseRequestStatus(projectId, requestId, { action: "SUBMIT" }, actorA());
    await transitionPurchaseRequestStatus(projectId, requestId, { action: "APPROVE", reason: "ok" }, actorA());
  });

  describe("1. Pedido de Compra (PurchaseOrder)", () => {
    it("cria PO a partir de requisição aprovada gerando código PO001", async () => {
      const order = await createPurchaseOrder(
        projectId,
        {
          requestId,
          supplierId,
          items: [
            { description: "Item A", quantity: 10, unit: "un", unitPrice: 5 },
            { description: "Item B", quantity: 4, unit: "un", unitPrice: 2.5 },
          ],
        },
        actorA()
      );

      expect(order.id).toBeDefined();
      expect(order.code).toBe("PO001");
      expect(order.status).toBe("DRAFT");
      expect(order.items).toHaveLength(2);
      expect(Number(order.totalAmount)).toBe(60); // 10*5 + 4*2.5 = 60
      orderId = order.id;
    });

    it("idempotência com clientUuid reutiliza PO criado", async () => {
      const clientUuid = randomUUID();
      const o1 = await createPurchaseOrder(
        projectId,
        {
          requestId,
          supplierId,
          clientUuid,
          items: [{ description: "Item X", quantity: 1, unit: "un", unitPrice: 1 }],
        },
        actorA()
      );
      // requisição já tem PO? não bloqueia criação de outro PO (regra: pode haver N). Mas requestId APPROVED ainda; criar segundo PO é permitido.
      const o2 = await createPurchaseOrder(
        projectId,
        {
          requestId,
          supplierId,
          clientUuid,
          items: [{ description: "Item X", quantity: 1, unit: "un", unitPrice: 1 }],
        },
        actorA()
      );
      expect(o2.id).toBe(o1.id);
      expect(o2.code).toBe(o1.code);
    });

    it("rejeita criação a partir de requisição não aprovada", async () => {
      // cria nova requisição (DRAFT) e tenta emitir PO
      const req = await createPurchaseRequest(
        projectId,
        { title: "Req rascunho", items: [{ description: "Item", quantity: 1, unit: "un" }] },
        actorA()
      );
      await expectAppError(
        createPurchaseOrder(projectId, { requestId: req.id, supplierId }, actorA()),
        "PROCUREMENT_INVALID_STATE"
      );
    });

    it("rejeita criação em projeto de outra organização", async () => {
      await expectAppError(
        createPurchaseOrder(otherProjectId, { requestId, supplierId }, actorB()),
        "NOT_FOUND"
      );
    });

    it("edita PO em DRAFT", async () => {
      const updated = await updatePurchaseOrder(
        projectId,
        orderId,
        { notes: "Entrega urgente" },
        actorA()
      );
      expect(updated.notes).toBe("Entrega urgente");
    });

    it("bloqueia edição após PO emitido", async () => {
      await transitionPurchaseOrderStatus(projectId, orderId, { action: "ISSUE" }, actorA());
      await expectAppError(
        updatePurchaseOrder(projectId, orderId, { notes: "x" }, actorA()),
        "PROCUREMENT_INVALID_STATE"
      );
    });

    it("transição ISSUE avança DRAFT para ISSUED", async () => {
      const order = await getPurchaseOrderById(projectId, orderId);
      expect(order?.status).toBe("ISSUED");
    });

    it("exclui apenas PO em DRAFT/CANCELLED", async () => {
      // cria um PO em DRAFT para excluir
      const draft = await createPurchaseOrder(
        projectId,
        {
          requestId,
          supplierId,
          items: [{ description: "Item Z", quantity: 1, unit: "un", unitPrice: 1 }],
        },
        actorA()
      );
      const res = await deletePurchaseOrder(projectId, draft.id, actorA());
      expect(res.success).toBe(true);

      await expectAppError(deletePurchaseOrder(projectId, orderId, actorA()), "PROCUREMENT_INVALID_STATE");
    });
  });

  describe("2. Recebimento (GoodsReceipt)", () => {
    it("cria recebimento contra PO ISSUED gerando código GR001", async () => {
      const receipt = await createGoodsReceipt(
        projectId,
        {
          purchaseOrderId: orderId,
          items: [{ purchaseOrderItemId: (await getPurchaseOrderById(projectId, orderId))!.items[0].id, quantityReceived: 5, quantityRejected: 0 }],
        },
        actorA()
      );

      expect(receipt.id).toBeDefined();
      expect(receipt.code).toBe("GR001");
      expect(receipt.status).toBe("DRAFT");
      receiptId = receipt.id;
    });

    it("rejeita quantidade recebida maior que o saldo", async () => {
      const order = await getPurchaseOrderById(projectId, orderId);
      const itemId = order!.items[0].id;
      // saldo restante = 10 - 0 (ainda não confirmado) = 10; pedir 11 excede
      await expectAppError(
        createGoodsReceipt(
          projectId,
          { purchaseOrderId: orderId, items: [{ purchaseOrderItemId: itemId, quantityReceived: 11 }] },
          actorA()
        ),
        "VALIDATION_ERROR"
      );
    });

    it("rejeita recebimento contra PO não emitido", async () => {
      const draftOrder = await createPurchaseOrder(
        projectId,
        {
          requestId,
          supplierId,
          items: [{ description: "Item W", quantity: 1, unit: "un", unitPrice: 1 }],
        },
        actorA()
      );
      const draftItemId = (await getPurchaseOrderById(projectId, draftOrder.id))!.items[0].id;
      await expectAppError(
        createGoodsReceipt(projectId, { purchaseOrderId: draftOrder.id, items: [{ purchaseOrderItemId: draftItemId, quantityReceived: 1 }] }, actorA()),
        "PROCUREMENT_INVALID_STATE"
      );
      await deletePurchaseOrder(projectId, draftOrder.id, actorA());
    });

    it("idempotência com clientUuid em recebimento", async () => {
      const clientUuid = randomUUID();
      const r1 = await createGoodsReceipt(
        projectId,
        {
          purchaseOrderId: orderId,
          clientUuid,
          items: [{ purchaseOrderItemId: (await getPurchaseOrderById(projectId, orderId))!.items[1].id, quantityReceived: 2 }],
        },
        actorA()
      );
      const r2 = await createGoodsReceipt(
        projectId,
        {
          purchaseOrderId: orderId,
          clientUuid,
          items: [{ purchaseOrderItemId: (await getPurchaseOrderById(projectId, orderId))!.items[1].id, quantityReceived: 2 }],
        },
        actorA()
      );
      expect(r2.id).toBe(r1.id);
      // cleanup desse recebimento extra (DRAFT)
      await deleteGoodsReceipt(projectId, r1.id, actorA());
    });

    it("confirma recebimento e atualiza PO para PARTIALLY_RECEIVED", async () => {
      const confirmed = await confirmGoodsReceipt(projectId, receiptId, actorA());
      expect(confirmed?.status).toBe("CONFIRMED");

      const order = await getPurchaseOrderById(projectId, orderId);
      expect(order?.status).toBe("PARTIALLY_RECEIVED");
      // item 0 recebeu 5 de 10
      const item0 = order!.items.find((i) => i.description === "Item A")!;
      expect(Number(item0.receivedQuantity)).toBe(5);
    });

    it("recebimento total move PO para FULLY_RECEIVED", async () => {
      // recebe o restante do item 0 (5) e todo o item 1 (4)
      const order = await getPurchaseOrderById(projectId, orderId);
      const item0 = order!.items.find((i) => i.description === "Item A")!;
      const item1 = order!.items.find((i) => i.description === "Item B")!;

      const r = await createGoodsReceipt(
        projectId,
        {
          purchaseOrderId: orderId,
          items: [
            { purchaseOrderItemId: item0.id, quantityReceived: 5 },
            { purchaseOrderItemId: item1.id, quantityReceived: 4 },
          ],
        },
        actorA()
      );
      await confirmGoodsReceipt(projectId, r.id, actorA());

      const updated = await getPurchaseOrderById(projectId, orderId);
      expect(updated?.status).toBe("FULLY_RECEIVED");
    });

    it("não exclui recebimento confirmado", async () => {
      await expectAppError(deleteGoodsReceipt(projectId, receiptId, actorA()), "PROCUREMENT_INVALID_STATE");
    });

    it("lista recebimentos por pedido", async () => {
      const list = await listGoodsReceipts(projectId, { purchaseOrderId: orderId });
      expect(list.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("3. Isolamento de tenant", () => {
    it("não lista POs de outra organização", async () => {
      const listB = await listPurchaseOrders(otherProjectId, {});
      expect(listB.length).toBe(0);
    });
  });
});
