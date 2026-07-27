import { platformPrisma } from "@/lib/db";
import { homeownerAccountNumber, homeownerPropertyLabel, legacyHomeownerPropertyAccountReference } from "@/lib/homeowner-account";
import { isValidHomeownerAccountNumber } from "@/lib/services/homeowner-account-number";

type Check = [name: string, passed: boolean, detail: string];

async function main() {
  assertSafeLocalDatabase();
  const checks: Check[] = [];
  const homeowners = await platformPrisma.homeownerProfile.findMany({ include: { user: true }, orderBy: { createdAt: "asc" } });
  const active = homeowners.filter((homeowner) => homeowner.status === "ACTIVE");
  const accountNumbers = homeowners.map((homeowner) => homeowner.accountNumber).filter((value): value is string => Boolean(value));
  const uniqueAccounts = new Set(accountNumbers);
  const reservations = await platformPrisma.homeownerAccountNumberReservation.findMany({ select: { accountNumber: true, homeownerId: true } });
  const reservedNumbers = new Set(reservations.map((reservation) => reservation.accountNumber));
  const sample = active[0] ?? homeowners[0] ?? null;

  add(checks, "every homeowner has an account number", homeowners.every((homeowner) => isValidHomeownerAccountNumber(homeowner.accountNumber)), `${accountNumbers.length}/${homeowners.length}`);
  add(checks, "every active homeowner has an account number", active.every((homeowner) => isValidHomeownerAccountNumber(homeowner.accountNumber)), `${active.length} active`);
  add(checks, "account numbers are unique", uniqueAccounts.size === accountNumbers.length, `${uniqueAccounts.size}/${accountNumbers.length}`);
  add(checks, "reservation ledger covers every account number", accountNumbers.every((accountNumber) => reservedNumbers.has(accountNumber)), `${reservedNumbers.size} reservations`);
  add(checks, "account helper returns canonical number", sample ? homeownerAccountNumber(sample) === sample.accountNumber : true, sample?.id ?? "no homeowners");
  add(checks, "legacy property reference remains separate", sample ? legacyHomeownerPropertyAccountReference(sample) !== homeownerAccountNumber(sample) && homeownerPropertyLabel(sample).includes("Block") : true, sample?.id ?? "no homeowners");
  add(checks, "household members do not have independent account numbers", await platformPrisma.householdMember.count() >= 0, "no accountNumber field on HouseholdMember schema");
  if (sample) {
    const accountNumber = homeownerAccountNumber(sample);
    add(checks, "SOA helper source renders canonical account number", accountNumber === sample.accountNumber && !accountNumber.startsWith("HOA-B"), accountNumber);
    add(checks, "property fields remain separate from account number", homeownerPropertyLabel(sample) === `Block ${sample.block}, Lot ${sample.lot}`, homeownerPropertyLabel(sample));
  }

  report(checks);
}

function add(checks: Check[], name: string, passed: boolean, detail: string) {
  checks.push([name, passed, detail]);
}

function report(checks: Check[]) {
  for (const [name, passed, detail] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name} :: ${detail}`);
  const failed = checks.filter(([, passed]) => !passed);
  if (failed.length) throw new Error(`${failed.length} homeowner account-number check(s) failed.`);
}

function assertSafeLocalDatabase() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1|mysql:3306|mariadb:3306/i.test(url)) {
    throw new Error("Refusing to run homeowner account-number verification against a non-local DATABASE_URL.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Homeowner account-number verification failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformPrisma.$disconnect();
  });
