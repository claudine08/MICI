import { prisma } from "./src/lib/prisma";
async function main() {
  const req = await prisma.requirement.update({
    where: { id: "071006eb-e69c-431e-822d-7fcf10fe02a2" },
    data: { wbsNodeId: "0ee80c6f-dec1-48b6-97c1-34a426198447", updatedBy: "30e38925-7c17-4f2c-bb70-aae28d262004", version: { increment: 1 } },
    select: { id:true, code:true, wbsNodeId:true }
  });
  console.log(JSON.stringify(req, null, 2));
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
