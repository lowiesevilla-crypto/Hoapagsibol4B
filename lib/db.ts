import { Prisma, PrismaClient, Role, TenantModule } from "@prisma/client";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { currentTenantContext, setTenantContext } from "@/lib/tenant-context";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const basePrisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

const authSecret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-only-secret-change-me-now");

async function resolveRequestTenantContext() {
  const existing = currentTenantContext();
  if (existing) return existing;
  try {
    const token = (await cookies()).get("hoa_session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, authSecret);
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    const tenantId = typeof payload.tenantId === "string" ? payload.tenantId : "";
    const tenantSlug = typeof payload.tenantSlug === "string" ? payload.tenantSlug : "";
    const role = payload.role as Role;
    if (!userId || !tenantId || !tenantSlug || !Object.values(Role).includes(role)) return null;
    const user = await basePrisma.user.findFirst({ where: { id: userId, tenantId, role, active: true, tenant: { slug: tenantSlug, status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } } }, select: { id: true } });
    if (!user) return null;
    const platform = role === Role.SUPER_ADMIN || role === Role.PLATFORM_ADMIN;
    const enabledModules = platform ? undefined : new Set((await basePrisma.tenantModuleEntitlement.findMany({ where: { tenantId, enabled: true }, select: { module: true } })).map((item) => item.module));
    return setTenantContext({ tenantId, role, platform, enabledModules });
  } catch {
    return null;
  }
}

type MutableRecord = Record<string, unknown>;
type DmmfField = (typeof Prisma.dmmf.datamodel.models)[number]["fields"][number];

const modelFields = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model.fields]));
const tenantModels = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "tenantId"))
    .map((model) => model.name),
);

const modelModules: Partial<Record<string, TenantModule>> = {
  Bill: TenantModule.BILLING,
  BillingRule: TenantModule.BILLING,
  DuesExemption: TenantModule.BILLING,
  Payment: TenantModule.BILLING,
  PaymentArchive: TenantModule.BILLING,
  PaymentRequest: TenantModule.BILLING,
  ReceiptCounter: TenantModule.BILLING,
  Collection: TenantModule.BILLING,
  BondRefund: TenantModule.BILLING,
  DataMigration: TenantModule.BILLING,
  ExpenseCategory: TenantModule.BILLING,
  Expense: TenantModule.BILLING,
  EmployeeProfile: TenantModule.PAYROLL,
  PayrollDeductionType: TenantModule.PAYROLL,
  EmployeeLoan: TenantModule.LOANS,
  PayrollAccess: TenantModule.PAYROLL,
  PayrollPeriod: TenantModule.PAYROLL,
  PayrollArchive: TenantModule.PAYROLL,
  PayrollDeduction: TenantModule.PAYROLL,
  Payslip: TenantModule.PAYROLL,
  PayrollCalendarDay: TenantModule.ATTENDANCE,
  EmployeeSchedule: TenantModule.ATTENDANCE,
  Attendance: TenantModule.ATTENDANCE,
  AttendanceAdjustment: TenantModule.ATTENDANCE,
  OvertimeRecord: TenantModule.ATTENDANCE,
  DocumentTemplate: TenantModule.DOCUMENTS,
  DocumentRequest: TenantModule.DOCUMENTS,
  DocumentVersion: TenantModule.DOCUMENTS,
  DocumentRequestHistory: TenantModule.DOCUMENTS,
  DocumentTypeConfiguration: TenantModule.DOCUMENTS,
  DocumentFieldConfiguration: TenantModule.DOCUMENTS,
  DocumentRequestEditAudit: TenantModule.DOCUMENTS,
  HouseholdMember: TenantModule.DOCUMENTS,
  DocumentCounter: TenantModule.DOCUMENTS,
  Vehicle: TenantModule.VEHICLES,
  ContractorProfile: TenantModule.CONTRACTORS,
  Announcement: TenantModule.ANNOUNCEMENTS,
  Event: TenantModule.EVENTS,
  ChatConversation: TenantModule.CHAT,
  ChatParticipant: TenantModule.CHAT,
  ChatMessage: TenantModule.CHAT,
  ChatAttachment: TenantModule.CHAT,
  UserPresence: TenantModule.CHAT,
};

function asRecord(value: unknown): MutableRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as MutableRecord : undefined;
}

function scopeWhere(value: unknown, tenantId: string) {
  const where = asRecord(value) ?? {};
  if (typeof where.tenantId === "string" && where.tenantId !== tenantId) {
    throw new Error("Cross-tenant query blocked.");
  }
  return { ...where, tenantId };
}

function relationFields(model: string): DmmfField[] {
  return (modelFields.get(model) ?? []).filter((field) => field.kind === "object");
}

function scopeList(value: unknown, transform: (entry: unknown) => unknown): unknown {
  return Array.isArray(value) ? value.map(transform) : transform(value);
}

function scopeRelationEnvelope(targetModel: string, value: unknown, tenantId: string): unknown {
  const envelope = asRecord(value);
  if (!envelope) return value;
  const result: MutableRecord = { ...envelope };
  if ("create" in result) result.create = scopeList(result.create, (entry) => scopeWriteData(targetModel, entry, tenantId));
  if ("createMany" in result) {
    const createMany = asRecord(result.createMany);
    if (createMany) result.createMany = { ...createMany, data: scopeList(createMany.data, (entry) => scopeWriteData(targetModel, entry, tenantId)) };
  }
  if ("connect" in result) result.connect = scopeList(result.connect, (entry) => scopeWhere(entry, tenantId));
  if ("set" in result) result.set = scopeList(result.set, (entry) => scopeWhere(entry, tenantId));
  if ("disconnect" in result && result.disconnect !== true && result.disconnect !== false) result.disconnect = scopeList(result.disconnect, (entry) => scopeWhere(entry, tenantId));
  if ("delete" in result && result.delete !== true && result.delete !== false) result.delete = scopeList(result.delete, (entry) => scopeWhere(entry, tenantId));
  if ("connectOrCreate" in result) {
    result.connectOrCreate = scopeList(result.connectOrCreate, (entry) => {
      const item = asRecord(entry) ?? {};
      return { ...item, where: scopeWhere(item.where, tenantId), create: scopeWriteData(targetModel, item.create, tenantId) };
    });
  }
  for (const operation of ["update", "upsert"] as const) {
    if (!(operation in result)) continue;
    result[operation] = scopeList(result[operation], (entry) => {
      const item = asRecord(entry) ?? {};
      if ("data" in item || "where" in item || "create" in item || "update" in item) {
        return {
          ...item,
          ...(item.where ? { where: scopeWhere(item.where, tenantId) } : {}),
          ...(item.data ? { data: scopeWriteData(targetModel, item.data, tenantId) } : {}),
          ...(item.create ? { create: scopeWriteData(targetModel, item.create, tenantId) } : {}),
          ...(item.update ? { update: scopeWriteData(targetModel, item.update, tenantId) } : {}),
        };
      }
      return scopeWriteData(targetModel, item, tenantId);
    });
  }
  if ("updateMany" in result) {
    result.updateMany = scopeList(result.updateMany, (entry) => {
      const item = asRecord(entry) ?? {};
      return { ...item, where: scopeWhere(item.where, tenantId), data: scopeWriteData(targetModel, item.data, tenantId) };
    });
  }
  if ("deleteMany" in result) result.deleteMany = scopeList(result.deleteMany, (entry) => scopeWhere(entry, tenantId));
  return result;
}

function scopeWriteData(model: string, value: unknown, tenantId: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => scopeWriteData(model, entry, tenantId));
  const data = asRecord(value);
  if (!data) return value;
  if (typeof data.tenantId === "string" && data.tenantId !== tenantId) throw new Error("Cross-tenant write blocked.");
  const result: MutableRecord = { ...data, ...(tenantModels.has(model) ? { tenantId } : {}) };
  for (const field of relationFields(model)) {
    if (field.name in result) result[field.name] = scopeRelationEnvelope(field.type, result[field.name], tenantId);
  }
  return result;
}

type DynamicDelegate = { findFirst(args: { where: MutableRecord; select: { tenantId: true } }): Promise<{ tenantId: string } | null> };

function delegateFor(model: string) {
  const key = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
  return (basePrisma as unknown as Record<string, DynamicDelegate>)[key];
}

async function validateRelationEnvelope(targetModel: string, value: unknown, tenantId: string): Promise<void> {
  const envelope = asRecord(value);
  if (!envelope) return;
  const nested: unknown[] = [];
  if ("create" in envelope) nested.push(...(Array.isArray(envelope.create) ? envelope.create : [envelope.create]));
  const createMany = asRecord(envelope.createMany);
  if (createMany?.data) nested.push(...(Array.isArray(createMany.data) ? createMany.data : [createMany.data]));
  for (const operation of ["update", "upsert", "connectOrCreate", "updateMany"] as const) {
    if (!(operation in envelope)) continue;
    const items = Array.isArray(envelope[operation]) ? envelope[operation] as unknown[] : [envelope[operation]];
    for (const entry of items) {
      const item = asRecord(entry);
      if (!item) continue;
      for (const key of ["data", "create", "update"] as const) if (item[key]) nested.push(item[key]);
      if (!item.data && !item.create && !item.update && operation === "update") nested.push(item);
    }
  }
  for (const entry of nested) await validateWriteData(targetModel, entry, tenantId);
}

async function validateWriteData(model: string, value: unknown, tenantId: string): Promise<void> {
  if (Array.isArray(value)) {
    for (const entry of value) await validateWriteData(model, entry, tenantId);
    return;
  }
  const data = asRecord(value);
  if (!data) return;
  for (const field of relationFields(model)) {
    const fromFields = field.relationFromFields ?? [];
    const toFields = field.relationToFields ?? [];
    if (tenantModels.has(field.type) && fromFields.length && fromFields.every((name) => data[name] !== undefined && data[name] !== null)) {
      const entityType = `${model}.${field.name}`;
      const compositeTenantIndex = fromFields.findIndex((name, index) => name === "tenantId" && toFields[index] === "tenantId");
      if (compositeTenantIndex >= 0) {
        const relationWhere: MutableRecord = {};
        fromFields.forEach((name, index) => {
          if (index !== compositeTenantIndex) relationWhere[toFields[index] || "id"] = data[name];
        });
        const actual = Object.keys(relationWhere).length
          ? await delegateFor(field.type)?.findFirst({ where: relationWhere, select: { tenantId: true } })
          : null;
        if (actual && actual.tenantId !== tenantId) {
          logTenantMismatch(entityType, tenantId, actual.tenantId);
          throw new Error(`Cross-tenant relation blocked for ${entityType}.`);
        }
        // The composite foreign key validates new related rows that are still
        // invisible to the base client outside this interactive transaction.
        continue;
      }
      const where: MutableRecord = { tenantId };
      fromFields.forEach((name, index) => { where[toFields[index] || "id"] = data[name]; });
      const related = await delegateFor(field.type)?.findFirst({ where, select: { tenantId: true } });
      if (!related) {
        const relationWhere: MutableRecord = {};
        fromFields.forEach((name, index) => { relationWhere[toFields[index] || "id"] = data[name]; });
        const actual = await delegateFor(field.type)?.findFirst({ where: relationWhere, select: { tenantId: true } });
        logTenantMismatch(entityType, tenantId, actual?.tenantId ?? "not-found");
        throw new Error(`Cross-tenant relation blocked for ${entityType}.`);
      }
    }
    if (field.name in data) await validateRelationEnvelope(field.type, data[field.name], tenantId);
  }
}

function logTenantMismatch(entityType: string, expectedTenantId: string, actualTenantId: string) {
  console.error("[tenant-boundary] Cross-tenant relation blocked.", { entityType, expectedTenantId, actualTenantId });
}

function enforceModule(model: string) {
  const context = currentTenantContext();
  const tenantModule = modelModules[model];
  if (!context || context.platform || !tenantModule || !context.enabledModules) return;
  if (!context.enabledModules.has(tenantModule)) throw new Error("This module is not included in your subscription plan.");
}

export const prisma = basePrisma.$extends({
  name: "tenant-boundary",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!tenantModels.has(model)) return query(args);
        const context = await resolveRequestTenantContext();
        if (!context) throw new Error(`Tenant context is required for ${model}.${operation}.`);
        const scoped = { ...(args as MutableRecord) };
        if (operation === "findMany" && scoped.take === undefined) scoped.take = 500;
        if (context.platform) return query(scoped as typeof args);
        enforceModule(model);
        if (["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany"].includes(operation)) {
          scoped.where = scopeWhere(scoped.where, context.tenantId);
        }
        if (["create", "createMany", "createManyAndReturn"].includes(operation)) scoped.data = scopeWriteData(model, scoped.data, context.tenantId);
        if (operation === "update" || operation === "updateMany") scoped.data = scopeWriteData(model, scoped.data, context.tenantId);
        if (operation === "upsert") {
          scoped.where = scopeWhere(scoped.where, context.tenantId);
          scoped.create = scopeWriteData(model, scoped.create, context.tenantId);
          scoped.update = scopeWriteData(model, scoped.update, context.tenantId);
        }
        if (scoped.data) await validateWriteData(model, scoped.data, context.tenantId);
        if (scoped.create) await validateWriteData(model, scoped.create, context.tenantId);
        if (scoped.update) await validateWriteData(model, scoped.update, context.tenantId);
        return query(scoped as typeof args);
      },
    },
  },
});

export const platformPrisma = basePrisma;
