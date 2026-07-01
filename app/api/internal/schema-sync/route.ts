import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const migrations = [
  "20260630000000_mysql_baseline",
  "20260630170000_production_rate_limits",
] as const;

function isExistingObjectError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|duplicate key name|duplicate foreign key constraint name/i.test(message);
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    let applied = 0;
    let existing = 0;
    const checksums: Array<{ name: string; checksum: string }> = [];

    for (const name of migrations) {
      const migrationPath = join(process.cwd(), "prisma", "migrations", name, "migration.sql");
      const sql = await readFile(migrationPath, "utf8");
      checksums.push({ name, checksum: createHash("sha256").update(sql).digest("hex") });

      const statements = sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) {
        const idempotent = statement.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
        try {
          await prisma.$executeRawUnsafe(idempotent);
          applied += 1;
        } catch (error) {
          if (!isExistingObjectError(error)) throw error;
          existing += 1;
        }
      }
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`checksum\` VARCHAR(64) NOT NULL,
        \`finished_at\` DATETIME(3) NULL,
        \`migration_name\` VARCHAR(255) NOT NULL,
        \`logs\` TEXT NULL,
        \`rolled_back_at\` DATETIME(3) NULL,
        \`started_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`applied_steps_count\` INTEGER UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`_prisma_migrations_migration_name_key\` (\`migration_name\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    for (const migration of checksums) {
      await prisma.$executeRaw`
        INSERT IGNORE INTO _prisma_migrations
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES
          (${randomUUID()}, ${migration.checksum}, CURRENT_TIMESTAMP(3), ${migration.name}, NULL, NULL, CURRENT_TIMESTAMP(3), 1)
      `;
    }

    return NextResponse.json({ ok: true, applied, existing });
  } catch (error) {
    console.error("Production schema synchronization failed.", error);
    return NextResponse.json({
      error: "Schema synchronization failed.",
      detail: error instanceof Error ? error.message.slice(-2_000) : String(error).slice(-2_000),
    }, { status: 500 });
  }
}
