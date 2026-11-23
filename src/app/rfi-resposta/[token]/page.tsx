import { RfiResponseView } from "@/components/supplier-rfi/rfi-response-view";
import { getRfiResponseByToken } from "@/modules/supplier-rfi/supplier-rfi";
import { notFound } from "next/navigation";

export const metadata = { title: "Resposta de RFI" };

export default async function RfiResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: any;
  try {
    data = await getRfiResponseByToken(token);
  } catch {
    notFound();
  }
  return <RfiResponseView token={token} data={data} />;
}