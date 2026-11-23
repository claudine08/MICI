import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { getResponseLink } from "@/modules/field/response-links";
import { getDiaryRow, getTaskRow, getConstraintRow, getProgressRow } from "@/modules/field/selectors";
import { submitDiaryResponse, submitTaskResponse, submitConstraintResponse, submitProgressResponse } from "@/modules/field/response-links";

export const { GET, POST } = apiHandler({
  GET: async (_request: NextRequest, context) => {
    const { token } = await (context as { params: Promise<{ token: string }> }).params;
    const link = await getResponseLink(token);
    if (link.entityType === "diary") {
      const diary = await getDiaryRow(link.organizationId, link.entityId);
      return Response.json({ type: "diary", link, entity: diary });
    }
    if (link.entityType === "task") {
      const task = await getTaskRow(link.organizationId, link.entityId);
      return Response.json({ type: "task", link, entity: task });
    }
    if (link.entityType === "constraint") {
      const constraint = await getConstraintRow(link.organizationId, link.entityId);
      return Response.json({ type: "constraint", link, entity: constraint });
    }
    if (link.entityType === "progress") {
      const progress = await getProgressRow(link.organizationId, link.entityId);
      return Response.json({ type: "progress", link, entity: progress });
    }
    throw new AppError("VALIDATION_ERROR", "Tipo não suportado.");
  },
  POST: async (request: NextRequest, context) => {
    const { token } = await (context as { params: Promise<{ token: string }> }).params;
    const body = await request.json().catch(() => null);
    const link = await getResponseLink(token);
    if (link.entityType === "diary") {
      await submitDiaryResponse(token, body ?? {});
      return Response.json({ ok: true });
    }
    if (link.entityType === "task") {
      await submitTaskResponse(token, body ?? {});
      return Response.json({ ok: true });
    }
    if (link.entityType === "constraint") {
      await submitConstraintResponse(token, body ?? {});
      return Response.json({ ok: true });
    }
    if (link.entityType === "progress") {
      await submitProgressResponse(token, body ?? {});
      return Response.json({ ok: true });
    }
    throw new AppError("VALIDATION_ERROR", "Tipo não suportado.");
  },
});