import { z } from "zod";
import {
  RISK_ACTIONS,
  RISK_CATEGORIES,
  RISK_RESPONSE_STRATEGIES,
} from "@/modules/risk/engine";

// Riscos (E10, §32): validações de entrada. Datas em AAAA-MM-DD; escala de
// probabilidade/impacto 1–5 (matriz 5×5 configurável por organização).

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

const probabilityOrImpact = z
  .number()
  .int("Use um inteiro de 1 a 5.")
  .min(1)
  .max(5);

const riskCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido (A–Z, 0–9, . _ -).");

const longText = z.string().trim().max(4000);

export const riskCategorySchema = z.enum(RISK_CATEGORIES);
export const riskResponseStrategySchema = z.enum(RISK_RESPONSE_STRATEGIES);
export const riskActionSchema = z.enum(RISK_ACTIONS);

export const createRiskSchema = z.object({
  code: riskCode.optional(),
  title: z.string().trim().min(1).max(200),
  cause: longText.optional(),
  event: longText.optional(),
  effect: longText.optional(),
  category: riskCategorySchema,
  probability: probabilityOrImpact.default(1),
  impact: probabilityOrImpact.default(1),
  ownerId: z.string().uuid().nullable().optional(),
  response: riskResponseStrategySchema.nullable().optional(),
  action: longText.optional(),
  dueDate: isoDate.optional(),
  wbsNodeId: z.string().uuid().nullable().optional(),
  activityId: z.string().uuid().nullable().optional(),
  costItemId: z.string().uuid().nullable().optional(),
});

export const updateRiskSchema = createRiskSchema.partial();

// Transição de status (POST /risks/[id]/status). `action` é o verbo da
// máquina de estados; `treatment` é o texto da ação de tratamento (campo
// `action` do §32) para não colidir com o verbo.
export const riskTransitionSchema = z.object({
  action: riskActionSchema,
  reason: z.string().trim().max(1000).optional(),
  response: riskResponseStrategySchema.optional(),
  treatment: longText.optional(),
  ownerId: z.string().uuid().optional(),
  dueDate: isoDate.optional(),
  residualProbability: probabilityOrImpact.optional(),
  residualImpact: probabilityOrImpact.optional(),
  residualNotes: z.string().trim().max(2000).optional(),
});

// Histórico de respostas (E10-US03): plano/revise a resposta do risco.
export const createRiskResponseSchema = z.object({
  strategy: riskResponseStrategySchema,
  action: longText.optional(),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Matriz configurável (E10-US02): 5 rótulos por eixo + limites de nível.
export const riskMatrixConfigSchema = z
  .object({
    probabilityLabels: z
      .array(z.string().trim().min(1).max(40))
      .length(5, "A matriz 5×5 exige exatamente 5 rótulos de probabilidade."),
    impactLabels: z
      .array(z.string().trim().min(1).max(40))
      .length(5, "A matriz 5×5 exige exatamente 5 rótulos de impacto."),
    lowMax: z.number().int().min(1).max(24),
    mediumMax: z.number().int().min(2).max(24),
    highMax: z.number().int().min(3).max(25),
  })
  .superRefine((value, ctx) => {
    if (!(value.lowMax < value.mediumMax && value.mediumMax < value.highMax)) {
      ctx.addIssue({
        code: "custom",
        path: ["lowMax"],
        message: "Limites precisam respeitar lowMax < mediumMax < highMax.",
      });
    }
  });
