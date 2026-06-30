import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Backup = {
  formatVersion: number;
  counts: Record<string, number>;
  models: Record<string, Record<string, unknown>[]>;
};

function delegateName(modelName: string) {
  return `${modelName[0].toLowerCase()}${modelName.slice(1)}`;
}

function wrappedValue(value: unknown) {
  if (typeof value === "object" && value && "$type" in value && "value" in value) {
    return String((value as { value: unknown }).value);
  }
  return String(value);
}

function reviveRow(modelName: string, row: Record<string, unknown>) {
  const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === modelName);
  if (!model) throw new Error(`Backup contains unknown Prisma model: ${modelName}`);

  const result = { ...row };
  for (const field of model.fields) {
    const value = result[field.name];
    if (value === null || value === undefined || field.kind !== "scalar") continue;
    if (field.type === "DateTime" && typeof value === "string") result[field.name] = new Date(value);
    if (field.type === "BigInt") result[field.name] = BigInt(wrappedValue(value));
    if (field.type === "Bytes") result[field.name] = Buffer.from(wrappedValue(value), "base64");
    if (field.type === "Decimal") result[field.name] = new Prisma.Decimal(wrappedValue(value));
  }
  return result;
}

async function main() {
  const sourceArg = process.argv[2];
  if (!sourceArg) throw new Error("Usage: pnpm db:import -- <backup.json>");
  const source = path.resolve(sourceArg);
  const backup = JSON.parse(await readFile(source, "utf8")) as Backup;
  if (backup.formatVersion !== 1) throw new Error(`Unsupported backup format: ${backup.formatVersion}`);

  const importedCounts: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const model of [...Prisma.dmmf.datamodel.models].reverse()) {
        const delegate = (tx as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[delegateName(model.name)];
        if (delegate?.deleteMany) await delegate.deleteMany();
      }
      for (const model of Prisma.dmmf.datamodel.models) {
        const rows = backup.models[model.name] ?? [];
        if (!rows.length) {
          importedCounts[model.name] = 0;
          continue;
        }
        const delegate = (tx as unknown as Record<string, { createMany: (args: { data: Record<string, unknown>[] }) => Promise<{ count: number }> }>)[delegateName(model.name)];
        if (!delegate?.createMany) continue;
        const result = await delegate.createMany({ data: rows.map((row) => reviveRow(model.name, row)) });
        importedCounts[model.name] = result.count;
      }
    } finally {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
    }
  }, { maxWait: 10_000, timeout: 120_000 });

  const mismatches = Object.entries(backup.counts).filter(([model, expected]) => importedCounts[model] !== expected);
  console.log(JSON.stringify({ source, importedCounts, mismatches }, null, 2));
  if (mismatches.length) throw new Error(`Import count verification failed for ${mismatches.length} model(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
