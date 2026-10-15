import { z } from "zod";

// Custos (E08, §29): itens do orçamento, compromissos e realizados.
// Validações de entrada. Datas em AAAA-MM-DD.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

export const commitmentStatusSchema = z.enum(["OPEN", "CLOSED", "CANCELLED"]);

const costCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

const amount = z.number().finite().gte(0);

export const createCostItemSchema = z.object({
  code: costCode.optional(),
  description: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(64),
  unit: z.string().trim().min(1).max(16),
  quantity: z.number().finite().gte(0),
  unitPrice: amount,
  wbsNodeId: z.string().uuid().nullable().optional(),
  origin: z.string().trim().max(32).optional(),
  fontePreco: z.string().trim().max(200).optional(),
});

export const updateCostItemSchema = createCostItemSchema.partial();

export const createCommitmentSchema = z.object({
  code: costCode.optional(),
  description: z.string().trim().min(1).max(300),
  supplier: z.string().trim().max(200).optional(),
  amount,
  committedAt: isoDate,
  costItemId: z.string().uuid().nullable().optional(),
});

export const updateCommitmentSchema = createCommitmentSchema
  .partial()
  .extend({ status: commitmentStatusSchema.optional() });

export const createActualSchema = z.object({
  code: costCode.optional(),
  description: z.string().trim().min(1).max(300),
  amount,
  incurredAt: isoDate,
  costItemId: z.string().uuid().nullable().optional(),
  commitmentId: z.string().uuid().nullable().optional(),
});

export const updateActualSchema = createActualSchema.partial();

export const evmQuerySchema = z.object({
  dataDate: isoDate.optional(),
});

// Importação do estimate de cozinha (POST /cost/import-estimate): recebe o
// JSON exportado por /orcamento (BudgetEstimate) e o transforma em itens de
// custo do projeto (replace-all).
export const importEstimateSchema = z.object({
  quantitativos: z
    .array(
      z.object({
        grupo: z.number().int().min(1).max(15),
        grupoNome: z.string().max(120),
        codigo: z.string().max(64),
        descricao: z.string().max(300),
        unidade: z.string().max(16),
        quantidade: z.number().finite().gte(0),
        pu: z.number().finite().gte(0),
        custoTotal: z.number().finite().gte(0),
        origem: z.string().max(32).optional(),
        fontePreco: z.string().max(200).optional(),
      })
    )
    .min(1)
    .max(2000),
  consolidacao: z
    .object({
      totalGeral: z.number().finite().gte(0),
      custoDireto: z.number().finite().gte(0),
    })
    .partial()
    .optional(),
});
