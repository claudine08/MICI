"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface OrgOption {
  organizationId: string;
  name: string;
}

export function OrgSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrgOption[];
  activeOrganizationId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onChange = async (organizationId: string) => {
    if (!organizationId || organizationId === activeOrganizationId) return;
    setPending(true);
    try {
      const response = await fetch("/api/v1/session/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  };

  if (organizations.length === 0) return null;

  return (
    <select
      aria-label="Organização ativa"
      disabled={pending}
      value={activeOrganizationId ?? ""}
      onChange={(event) => void onChange(event.target.value)}
      className={cn(
        "h-8 max-w-56 rounded-md border border-border bg-surface px-2 text-sm font-medium text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60"
      )}
    >
      {!activeOrganizationId && <option value="">Selecionar organização…</option>}
      {organizations.map((org) => (
        <option key={org.organizationId} value={org.organizationId}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
