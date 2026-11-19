import { RfiResponseView } from "@/components/supplier-rfi/rfi-response-view";
import { notFound } from "next/navigation";

export const metadata = { title: "Resposta de RFI" };

export default async function RfiResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: any;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/v1/rfi-responses/${token}`, { cache: "no-store" });
    if (!res.ok) notFound();
    data = await res.json();
  } catch {
    notFound();
  }
  return <RfiResponseView token={token} data={data} />;
}