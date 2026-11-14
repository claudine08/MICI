import { prisma } from "./src/lib/prisma";
async function main() {
  const reqs = await prisma.requirement.findMany({ where: { description: { contains: "2000" } }, select: { id:true, code:true, description:true, projectId:true, wbsNodeId:true } });
  console.log(JSON.stringify(reqs, null, 2));
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
