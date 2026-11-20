import { FieldResponseView } from "@/components/field/field-response-view";
import { notFound } from "next/navigation";

export const metadata = { title: "Resposta de Campo" };

export default async function FieldResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FieldResponseView token={token} />;
}