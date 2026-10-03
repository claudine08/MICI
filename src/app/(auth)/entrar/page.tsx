import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/painel");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight text-primary">MICI</div>
          <div className="text-sm text-muted-foreground">
            Gestão de Implantação com Governança
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Use seu e-mail e senha corporativos.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Demo: admin@mici.demo / Demo@1234
          </p>
        )}
      </div>
    </main>
  );
}
