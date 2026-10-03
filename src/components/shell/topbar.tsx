import { OrgSwitcher, type OrgOption } from "@/components/shell/org-switcher";
import { UserMenu } from "@/components/shell/user-menu";
import { Badge } from "@/components/ui/badge";

export function Topbar({
  userName,
  userEmail,
  roleCodes,
  organizations,
  activeOrganizationId,
}: {
  userName: string;
  userEmail: string;
  roleCodes: string[];
  organizations: OrgOption[];
  activeOrganizationId: string | null;
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
      <UserMenu userName={userName} userEmail={userEmail} />
    </header>
  );
}
