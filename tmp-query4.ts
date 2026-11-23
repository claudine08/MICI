import { prisma } from "./src/lib/prisma";
async function main() {
  const projectId = "0870c7a7-229f-4f5d-a077-a766edde154e";
  const nodes = await prisma.wBSNode.findMany({ where: { projectId }, select: { id:true, code:true, name:true, deletedAt:true } });
  console.log(JSON.stringify(nodes, null, 2));
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
