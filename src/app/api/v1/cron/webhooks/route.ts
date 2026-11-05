import type { NextRequest } from "next/server";
import { apiHandler } from "@/core/api";
import { AppError } from "@/core/errors";
import { dispatchPendingWebhooks } from "@/modules/integrations/webhooks";

export const { POST } = apiHandler({
  POST: async (request: NextRequest) => {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get("authorization");
    if (secret && auth !== `Bearer ${secret}`) {
      throw new AppError("FORBIDDEN", "Cron não autorizado.");
    }
    const result = await dispatchPendingWebhooks();
    return Response.json(result);
  },
});