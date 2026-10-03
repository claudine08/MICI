import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NoPermission({ required }: { required: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Seu papel não possui a permissão <code>{required}</code>. Solicite ao administrador
            da organização.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
