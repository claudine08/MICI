import { getApprovalRequest } from "@/modules/integrations/approvals";
import { ApprovalView } from "@/components/integrations/approval-view";
import { notFound } from "next/navigation";

export const metadata = { title: "Aprovação" };

export default async function AprovacaoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let approval;
  try {
    approval = await getApprovalRequest(token);
  } catch {
    notFound();
  }
  return (
    <ApprovalView
      token={token}
      approval={{
        id: approval.id,
        objectType: approval.objectType,
        objectId: approval.objectId,
        projectId: approval.projectId,
        approverEmail: approval.approverEmail,
        status: approval.status,
        decisionComment: approval.decisionComment,
        decidedByName: approval.decidedByName,
        decidedByEmail: approval.decidedByEmail,
        decidedAt: approval.decidedAt ? approval.decidedAt.toISOString() : null,
        expiresAt: approval.expiresAt.toISOString(),
      }}
    />
  );
}