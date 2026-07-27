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
  let reassignedExistingValid = 0;
  for (const homeowner of homeowners) {
    if (homeowner.accountNumber) {
      if (isValidHomeownerAccountNumber(homeowner.accountNumber)) {
        const before = homeowner.accountNumber;
        await platformPrisma.homeownerAccountNumberReservation.upsert({
          where: { accountNumber: homeowner.accountNumber },
          create: { tenantId: homeowner.tenantId, homeownerId: homeowner.id, accountNumber: homeowner.accountNumber, reason: "BACKFILL_PRESERVE" },
          update: { homeownerId: homeowner.id },
        });
        if (homeowner.accountNumber !== before) reassignedExistingValid++;
        preserved++;
        continue;
      }
      invalid.push(homeowner.id);
      continue;
    }
    await ensureHomeownerAccountNumber(homeowner);
    assigned++;
  }
  if (invalid.length) {
    throw new Error(`Found ${invalid.length} homeowner profile(s) with invalid existing account numbers. Correct them before backfill can be considered complete.`);
  }
  console.log(`DONE total=${homeowners.length} preserved=${preserved} assigned=${assigned} invalid=${invalid.length} reassignedExistingValid=${reassignedExistingValid}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Backfill failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformPrisma.$disconnect();
  });
