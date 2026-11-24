import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { OrgSwitcher, type OrgOption } from "@/components/shell/org-switcher";
import { UserMenu } from "@/components/shell/user-menu";
import { GuideTrigger } from "@/components/shell/guide-trigger";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export function Topbar({
  userName,
  userEmail,
  roleCodes,
  organizations,
  activeOrganizationId,
  hasPmoAccess = false,
}: {
  userName: string;
  userEmail: string;
  roleCodes: string[];
  organizations: OrgOption[];
  activeOrganizationId: string | null;
  hasPmoAccess?: boolean;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-sm font-semibold text-foreground md:hidden">MICI</span>
        <OrgSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
        />
        {roleCodes.length > 0 && (
          <div className="hidden items-center gap-1.5 lg:flex">
            {roleCodes.slice(0, 3).map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {hasPmoAccess && (
        <Link
          href="/pmo"
          title="Dashboard PMO"
          className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span className="hidden sm:inline">PMO</span>
        </Link>
      )}
      <GuideTrigger />
      <UserMenu userName={userName} userEmail={userEmail} />
    </header>
  );
}
