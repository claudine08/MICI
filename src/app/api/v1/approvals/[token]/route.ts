import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { getApprovalRequest } from "@/modules/integrations/approvals";

export const { GET } = apiHandler({
  GET: async (_request, context) => {
    const { token } = await (context as { params: Promise<{ token: string }> }).params;
    const approval = await getApprovalRequest(token);
    return Response.json({ approval });
  },
});