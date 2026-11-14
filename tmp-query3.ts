import { prisma } from "./src/lib/prisma";
async function main() {
  const p = await prisma.project.findUnique({ where: { id: "0870c7a7-229f-4f5d-a077-a766edde154e" }, select: { code:true, name:true, projectType:true } });
  console.log(JSON.stringify(p, null, 2));
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
