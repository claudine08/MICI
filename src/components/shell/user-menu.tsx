"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UserMenu({ userName, userEmail }: { userName: string; userEmail: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right leading-tight sm:block">
        <div className="text-sm font-medium text-foreground">{userName}</div>
        <div className="text-xs text-muted-foreground">{userEmail}</div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void signOut({ callbackUrl: "/entrar" })}
        title="Sair"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair
      </Button>
    </div>
  );
}
