import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function delegateName(modelName: string) {
  return `${modelName[0].toLowerCase()}${modelName.slice(1)}`;
}

function serialize(_key: string, value: unknown) {
  if (typeof value === "bigint") return { $type: "BigInt", value: value.toString() };
  if (Buffer.isBuffer(value)) return { $type: "Bytes", value: value.toString("base64") };
  if (Prisma.Decimal.isDecimal(value)) return { $type: "Decimal", value: value.toString() };
  return value;
}

async function main() {
  const target = path.resolve(process.argv[2] ?? `backups/database-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(target), { recursive: true });

  const models: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = (prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>)[delegateName(model.name)];
    if (!delegate?.findMany) continue;
    const rows = await delegate.findMany();
    models[model.name] = rows;
    counts[model.name] = rows.length;
  }

  const payload = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    databaseProvider: process.env.DATABASE_PROVIDER ?? new URL(process.env.DATABASE_URL ?? "mysql://localhost").protocol.replace(":", ""),
    counts,
    models,
  };
  await writeFile(target, JSON.stringify(payload, serialize, 2), "utf8");
  console.log(JSON.stringify({ target, counts, totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
