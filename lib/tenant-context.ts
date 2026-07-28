import { AsyncLocalStorage } from "node:async_hooks";
import type { Role, TenantModule } from "@prisma/client";

export type TenantRequestContext = {
  tenantId: string;
  role?: Role;
  platform: boolean;
  enabledModules?: ReadonlySet<TenantModule>;
};

const globalForTenantContext = globalThis as unknown as {
  tenantRequestContext?: AsyncLocalStorage<TenantRequestContext>;
};

const storage = globalForTenantContext.tenantRequestContext ?? new AsyncLocalStorage<TenantRequestContext>();
globalForTenantContext.tenantRequestContext = storage;

export function currentTenantContext() {
  return storage.getStore();
}

export function setTenantContext(context: TenantRequestContext) {
  storage.enterWith(context);
  return context;
}

export function runWithTenant<T>(tenantId: string, callback: () => T, options?: { role?: Role; enabledModules?: Iterable<TenantModule> }) {
  return storage.run({
    tenantId,
    role: options?.role,
    platform: false,
    enabledModules: options?.enabledModules ? new Set(options.enabledModules) : undefined,
  }, callback);
}

export function runAsPlatform<T>(callback: () => T, tenantId = "tenant_pagsibol4b_default") {
  return storage.run({ tenantId, platform: true }, callback);
}

export function withTenantContext<T>(tenantId: string, callback: () => T) {
  const current = storage.getStore();
  if (!current) return runWithTenant(tenantId, callback);
  if (!current.platform && current.tenantId !== tenantId) throw new Error("Cross-tenant context switch blocked.");
  return callback();
}
