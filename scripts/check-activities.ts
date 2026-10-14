import { prisma } from "@/lib/prisma";

// Uso: npx dotenv -e .env.vercel.tmp -- tsx scripts/check-activities.ts

async function main() {
  const groups = await prisma.scheduleActivity.groupBy({
    by: ["projectId", "organizationId"],
    _count: true,
  });
  for (const g of groups) {
    console.log(
      `projectId=${g.projectId} org=${g.organizationId} count=${g._count}`
    );
  }
}

void main().finally(() => prisma.$disconnect());
