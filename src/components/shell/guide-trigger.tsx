"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GuideTrigger() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.dispatchEvent(new Event("mici:open-guide"))}
      title="Abrir guia MICI"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      Guia
    </Button>
  );
}