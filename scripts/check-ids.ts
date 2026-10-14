import { prisma } from "@/lib/prisma";

// Uso: npx dotenv -e <env> -- tsx scripts/check-ids.ts
// Compara chaves principais entre ambientes.

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  console.log("org:", org?.id, org?.name);
  const users = await prisma.user.findMany({ select: { id: true, email: true }, orderBy: { email: "asc" } });
  for (const u of users) console.log("user:", u.id, u.email);
  const projects = await prisma.project.findMany({ select: { id: true, code: true, name: true } });
  for (const p of projects) console.log("project:", p.id, p.code, p.name);
  const counts = {
    requirements: await prisma.requirement.count(),
    wbsNodes: await prisma.wBSNode.count(),
    activities: await prisma.scheduleActivity.count(),
    baselines: await prisma.baseline.count(),
    calendars: await prisma.projectCalendar.count(),
    audit: await prisma.auditEvent.count(),
  };
  console.log("counts:", JSON.stringify(counts));
}

void main().finally(() => prisma.$disconnect());
