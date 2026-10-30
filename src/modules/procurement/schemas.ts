import { z } from "zod";
import {
  PURCHASE_REQUEST_ACTIONS,
  QUOTATION_ACTIONS,
  SUPPLIER_CATEGORIES,
  SUPPLIER_STATUSES,
} from "@/modules/procurement/engine";
import { FIELD_PRIORITIES } from "@/modules/field/engine";

// Suprimentos (E14, §49): validações de entrada via Zod.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

const procurementCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

const clientUuid = z.string().uuid().optional();

// ---------------------------------------------------------------------------
// Fornecedor (Supplier)
// ---------------------------------------------------------------------------

export const supplierStatusSchema = z.enum(SUPPLIER_STATUSES);
export const supplierCategorySchema = z.enum(SUPPLIER_CATEGORIES);

export const createSupplierSchema = z.object({
  code: procurementCode.optional(),
  name: z.string().trim().min(1, "Nome/Razão Social obrigatório.").max(200),
  tradeName: z.string().trim().max(200).optional(),
  taxId: z.string().trim().max(32).optional(),
  category: supplierCategorySchema.optional(),
  email: z.string().trim().email("E-mail inválido.").max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  contactName: z.string().trim().max(200).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(4000).optional(),
  clientUuid,
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  status: supplierStatusSchema.optional(),
});

// ---------------------------------------------------------------------------
// Item da Requisição de Compra (PurchaseRequestItem)
// ---------------------------------------------------------------------------

export const purchaseRequestItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  itemNumber: z.number().int().positive().optional(),
  description: z.string().trim().min(1, "Descrição do item obrigatória.").max(500),
  quantity: z.number().positive("Quantidade deve ser maior que zero."),
  unit: z.string().trim().min(1, "Unidade obrigatória.").max(32),
  estimatedUnitPrice: z.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Requisição de Compra (PurchaseRequest)
// ---------------------------------------------------------------------------

export const purchaseRequestActionSchema = z.enum(PURCHASE_REQUEST_ACTIONS);

export const createPurchaseRequestSchema = z.object({
  code: procurementCode.optional(),
  title: z.string().trim().min(1, "Título obrigatório.").max(300),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(FIELD_PRIORITIES).default("MEDIUM"),
  requiredDate: isoDate.optional(),
  wbsNodeId: z.string().uuid().optional(),
  activityId: z.string().uuid().optional(),
  costCenter: z.string().trim().max(100).optional(),
  costItemId: z.string().uuid().optional(),
  items: z.array(purchaseRequestItemInputSchema).min(1, "Adicione ao menos um item à requisição."),
  clientUuid,
});

export const updatePurchaseRequestSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(FIELD_PRIORITIES).optional(),
  requiredDate: isoDate.optional().nullable(),
  wbsNodeId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid().optional().nullable(),
  costCenter: z.string().trim().max(100).optional().nullable(),
  costItemId: z.string().uuid().optional().nullable(),
  items: z.array(purchaseRequestItemInputSchema).min(1).optional(),
});

export const transitionPurchaseRequestSchema = z.object({
  action: purchaseRequestActionSchema,
  reason: z.string().trim().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Item da Cotação (QuotationItem)
// ---------------------------------------------------------------------------

export const quotationItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  requestItemId: z.string().uuid().optional(),
  description: z.string().trim().min(1, "Descrição obrigatória.").max(500),
  quantity: z.number().positive("Quantidade deve ser positiva."),
  unit: z.string().trim().min(1).max(32),
  unitPrice: z.number().nonnegative("Preço unitário deve ser não-negativo."),
  leadTimeDays: z.number().int().nonnegative().optional(),
  brand: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Cotação (Quotation)
// ---------------------------------------------------------------------------

export const quotationActionSchema = z.enum(QUOTATION_ACTIONS);

export const createQuotationSchema = z.object({
  code: procurementCode.optional(),
  requestId: z.string().uuid("Requisição de compra obrigatória."),
  supplierId: z.string().uuid("Fornecedor obrigatório."),
  quotationDate: isoDate.optional(),
  validUntil: isoDate.optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  paymentTerms: z.string().trim().max(200).optional(),
  shippingTerms: z.string().trim().max(100).optional(),
  shippingCost: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  notes: z.string().trim().max(4000).optional(),
  items: z.array(quotationItemInputSchema).min(1, "Cotação deve conter ao menos 1 item."),
  clientUuid,
});

export const updateQuotationSchema = z.object({
  supplierId: z.string().uuid().optional(),
  quotationDate: isoDate.optional(),
  validUntil: isoDate.optional().nullable(),
  leadTimeDays: z.number().int().nonnegative().optional().nullable(),
  paymentTerms: z.string().trim().max(200).optional().nullable(),
  shippingTerms: z.string().trim().max(100).optional().nullable(),
  shippingCost: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
  items: z.array(quotationItemInputSchema).min(1).optional(),
});

export const transitionQuotationSchema = z.object({
  action: quotationActionSchema,
  reason: z.string().trim().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Mapa Comparativo (BidComparison)
// ---------------------------------------------------------------------------

export const createOrUpdateBidComparisonSchema = z.object({
  code: procurementCode.optional(),
  selectedQuotationId: z.string().uuid().optional().nullable(),
  selectionReason: z.string().trim().max(4000).optional().nullable(),
  clientUuid,
});

export const completeBidComparisonSchema = z.object({
  selectedQuotationId: z.string().uuid("Selecione a cotação vencedora para concluir."),
  selectionReason: z.string().trim().min(5, "Justificativa de escolha obrigatória.").max(4000),
});

