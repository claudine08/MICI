import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phone: true },
  });
  if (!user || !user.email) redirect("/entrar");

  return (
    <ProfileView
      initialName={user.name}
      initialEmail={user.email}
      initialPhone={user.phone}
    />
  );
}