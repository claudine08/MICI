"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const E164 = /^\+[1-9]\d{6,14}$/;

export function ProfileView({
  initialName,
  initialEmail,
  initialPhone,
}: {
  initialName: string | null;
  initialEmail: string;
  initialPhone: string | null;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const invalid = phone.trim() !== "" && !E164.test(phone.trim());

  const save = async () => {
    setError(null);
    setSuccess(null);
    if (invalid) {
      setError("Telefone inválido. Use formato E.164, ex.: +5511999998888.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<{ phone: string | null }>("/api/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ phone: phone.trim() === "" ? "" : phone.trim() }),
      });
      setPhone(result.phone ?? "");
      setSuccess("Telefone atualizado.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao atualizar telefone.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Perfil</h1>
        <p className="text-sm text-muted-foreground">
          Dados da sua conta e canal de notificação por WhatsApp.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Conta</CardTitle>
          <CardDescription>Informações básicas do usuário autenticado.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Nome: </span>
            <span className="font-medium">{initialName ?? "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">E-mail: </span>
            <span className="font-medium">{initialEmail}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Telefone (WhatsApp)</CardTitle>
          <CardDescription>
            Usado para notificações por WhatsApp. Formato E.164 (ex.: +5511999998888). Deixe vazio para remover.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-phone">Telefone</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profile-phone"
                className="pl-9"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+5511999998888"
              />
            </div>
            {invalid ? (
              <p className="text-xs text-destructive">Formato inválido. Use +código do país + número (7 a 15 dígitos).</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy || invalid}>
              {busy ? "Salvando..." : "Salvar telefone"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}