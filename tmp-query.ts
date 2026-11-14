import { prisma } from "./src/lib/prisma";
async function main() {
  const reqs = await prisma.requirement.findMany({ where: { code: "REQ-001" }, select: { id:true, code:true, description:true, projectId:true, wbsNodeId:true, organizationId:true } });
  console.log(JSON.stringify(reqs, null, 2));
  for (const r of reqs) {
    if (r.wbsNodeId) {
      const w = await prisma.wBSNode.findUnique({ where: { id: r.wbsNodeId }, select: { code:true, name:true } });
      console.log("WBS:", w);
    }
  }
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
