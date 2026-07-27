import { platformPrisma } from "../lib/db";
import { ensureHomeownerAccountNumber, isValidHomeownerAccountNumber } from "../lib/services/homeowner-account-number";

async function main() {
  const homeowners = await platformPrisma.homeownerProfile.findMany({
    select: { id: true, tenantId: true, accountNumber: true },
    orderBy: { createdAt: "asc" },
  });
  let preserved = 0;
  let assigned = 0;
  const invalid: string[] = [];
  for (const homeowner of homeowners) {
    if (homeowner.accountNumber) {
      if (isValidHomeownerAccountNumber(homeowner.accountNumber)) {
        await platformPrisma.homeownerAccountNumberReservation.upsert({
          where: { accountNumber: homeowner.accountNumber },
          create: { tenantId: homeowner.tenantId, homeownerId: homeowner.id, accountNumber: homeowner.accountNumber, reason: "BACKFILL_PRESERVE" },
          update: { homeownerId: homeowner.id },
        });
        preserved++;
        console.log(`PRESERVED homeowner=${homeowner.id}`);
        continue;
      }
      invalid.push(homeowner.id);
      console.log(`INVALID homeowner=${homeowner.id}`);
      continue;
    }
    await ensureHomeownerAccountNumber(homeowner);
    assigned++;
    console.log(`ASSIGNED homeowner=${homeowner.id}`);
  }
  if (invalid.length) {
    throw new Error(`Found ${invalid.length} homeowner profile(s) with invalid existing account numbers. Correct them before backfill can be considered complete.`);
  }
  console.log(`DONE total=${homeowners.length} preserved=${preserved} assigned=${assigned}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Backfill failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformPrisma.$disconnect();
  });
