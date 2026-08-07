import { PrismaClient } from "@prisma/client";

import {
  applyPublishedTemplateReplication,
  previewPublishedTemplateReplication,
  publishedTemplateReplicationSourceTenantId,
  publishedTemplateReplicationTargetTenantId,
} from "@/lib/services/published-template-replication";
import {
  expectedDatabaseHost,
  expectedDatabaseName,
  loadOptionalEnvFile,
  parseDatabaseUrl,
} from "@/scripts/pass-template-packages";

const CONFIRMATION_ENV = "CONFIRM_HOSTINGER_TEMPLATE_REPLICATION";
const ACTOR_ENV = "CONFIRM_TEMPLATE_REPLICATION_ACTOR_USER_ID";

const args = process.argv.slice(2);
loadOptionalEnvFile(args);
assertProductionGuards();

const apply = args.includes("--apply");
const explicitDryRun = args.includes("--dry-run");
const confirmDigest =
  args
    .find((argument) => argument.startsWith("--confirm-digest="))
    ?.slice("--confirm-digest=".length)
    .trim() || null;
const prisma = new PrismaClient();

function assertProductionGuards() {
  if (process.platform === "win32") {
    throw new Error(
      "Refusing to run production template replication from the local Windows development environment.",
    );
  }
  if (process.env[CONFIRMATION_ENV] !== "YES") {
    throw new Error(`${CONFIRMATION_ENV}=YES is required.`);
  }
  if (
    process.env.CONFIRM_SOURCE_TENANT_ID !== publishedTemplateReplicationSourceTenantId
  ) {
    throw new Error(
      `CONFIRM_SOURCE_TENANT_ID=${publishedTemplateReplicationSourceTenantId} is required.`,
    );
  }
  if (
    process.env.CONFIRM_TARGET_TENANT_ID !== publishedTemplateReplicationTargetTenantId
  ) {
    throw new Error(
      `CONFIRM_TARGET_TENANT_ID=${publishedTemplateReplicationTargetTenantId} is required.`,
    );
  }
  if (!process.env[ACTOR_ENV]?.trim()) {
    throw new Error(`${ACTOR_ENV}=<target-system-admin-user-id> is required.`);
  }
  if (process.env.EXPECTED_DATABASE_HOST !== expectedDatabaseHost) {
    throw new Error(`EXPECTED_DATABASE_HOST=${expectedDatabaseHost} is required.`);
  }
  if (process.env.EXPECTED_DATABASE_NAME !== expectedDatabaseName) {
    throw new Error(`EXPECTED_DATABASE_NAME=${expectedDatabaseName} is required.`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Production DATABASE_URL is unavailable.");
  const parsed = parseDatabaseUrl(databaseUrl);
  if (parsed.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://.");
  if (parsed.host === "localhost" || parsed.host === "::1") {
    throw new Error("DATABASE_URL host must not be localhost or ::1.");
  }
  if (parsed.host !== expectedDatabaseHost) {
    throw new Error("DATABASE_URL host does not match EXPECTED_DATABASE_HOST.");
  }
  if (parsed.database === "hoahub_prodclone_local" || parsed.database === "hoa_portal") {
    throw new Error("Refusing to run against a non-production database.");
  }
  if (parsed.database !== expectedDatabaseName) {
    throw new Error("DATABASE_URL database does not match EXPECTED_DATABASE_NAME.");
  }
}

async function main() {
  if (apply && explicitDryRun) {
    throw new Error("Use only one mode: --dry-run or --apply.");
  }
  if (apply && !confirmDigest) {
    throw new Error("--apply requires --confirm-digest=<digest-from-the-latest-dry-run>.");
  }

  const actorUserId = process.env[ACTOR_ENV]!.trim();
  const preview = await previewPublishedTemplateReplication(prisma, actorUserId);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "DRY_RUN",
        ...preview,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log(
      `DRY RUN ONLY. To apply this exact plan, rerun with --apply --confirm-digest=${preview.planDigest}`,
    );
    return;
  }

  const result = await applyPublishedTemplateReplication(
    prisma,
    actorUserId,
    confirmDigest!,
  );
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
