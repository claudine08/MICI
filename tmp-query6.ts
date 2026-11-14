import { prisma } from "./src/lib/prisma";
async function main() {
  const r = await prisma.requirement.findUnique({ where: { id: "071006eb-e69c-431e-822d-7fcf10fe02a2" }, select: { createdBy:true, updatedBy:true } });
  console.log(JSON.stringify(r));
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
