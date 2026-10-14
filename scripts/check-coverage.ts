import { prisma } from "@/lib/prisma";

// Uso: npx dotenv -e .env.vercel.tmp -- tsx scripts/check-coverage.ts
// Diagnóstico read-only do banco apontado por DATABASE_URL.

async function main() {
  console.log("organizations:", await prisma.organization.count());
  console.log("users:", await prisma.user.count());
  console.log("projects:", await prisma.project.count());
  console.log("clients:", await prisma.client.count());
  console.log("requirements:", await prisma.requirement.count());
  console.log("wbsNodes:", await prisma.wBSNode.count());
  console.log("scheduleActivities:", await prisma.scheduleActivity.count());
  console.log("baselines:", await prisma.baseline.count());
  console.log("projectCalendars:", await prisma.projectCalendar.count());
  console.log("auditEvents:", await prisma.auditEvent.count());
}

void main().finally(() => prisma.$disconnect());
