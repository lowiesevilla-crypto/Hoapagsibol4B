import { createReadStream } from "node:fs";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { safeTenantSlug, uploadDirectory } from "@/lib/storage";

export type RepositoryStoredObject = {
  storageKey: string;
  size: number;
};

export interface RepositoryStorage {
  put(input: { tenantSlug: string; originalFileName: string; data: Uint8Array; now?: Date }): Promise<RepositoryStoredObject>;
  openReadStream(input: { tenantSlug: string; storageKey: string }): Promise<Readable>;
  delete(input: { tenantSlug: string; storageKey: string }): Promise<void>;
  exists(input: { tenantSlug: string; storageKey: string }): Promise<boolean>;
}

function safeExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (!extension || !/^\.[a-z0-9]{1,10}$/.test(extension)) return "";
  return extension;
}

function normalizeStorageKey(storageKey: string) {
  const normalized = storageKey.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\0")) {
    throw new Error("Invalid repository storage key.");
  }
  return normalized;
}

function tenantRepositoryPrefix(tenantSlug: string) {
  return `tenants/${safeTenantSlug(tenantSlug)}/documents/repository/`;
}

function assertTenantStorageKey(tenantSlug: string, storageKey: string) {
  const normalized = normalizeStorageKey(storageKey);
  const prefix = tenantRepositoryPrefix(tenantSlug);
  if (!normalized.startsWith(prefix)) throw new Error("Cross-tenant repository storage access blocked.");
  return normalized;
}

function absolutePathForKey(storageKey: string) {
  const normalized = normalizeStorageKey(storageKey);
  const root = uploadDirectory();
  const absolute = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Repository storage path escaped the upload root.");
  }
  return absolute;
}

function storageKeyForUpload(tenantSlug: string, originalFileName: string, now = new Date()) {
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${tenantRepositoryPrefix(tenantSlug)}${year}/${month}/${randomUUID()}${safeExtension(originalFileName)}`;
}

export class LocalRepositoryStorage implements RepositoryStorage {
  async put(input: { tenantSlug: string; originalFileName: string; data: Uint8Array; now?: Date }) {
    const storageKey = storageKeyForUpload(input.tenantSlug, input.originalFileName, input.now);
    const absolute = absolutePathForKey(storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.data, { flag: "wx" });
    return { storageKey, size: input.data.byteLength };
  }

  async openReadStream(input: { tenantSlug: string; storageKey: string }) {
    const storageKey = assertTenantStorageKey(input.tenantSlug, input.storageKey);
    const absolute = absolutePathForKey(storageKey);
    await access(absolute);
    return createReadStream(absolute);
  }

  async delete(input: { tenantSlug: string; storageKey: string }) {
    const storageKey = assertTenantStorageKey(input.tenantSlug, input.storageKey);
    const absolute = absolutePathForKey(storageKey);
    try {
      await unlink(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async exists(input: { tenantSlug: string; storageKey: string }) {
    const storageKey = assertTenantStorageKey(input.tenantSlug, input.storageKey);
    try {
      await access(absolutePathForKey(storageKey));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}

export const repositoryStorage: RepositoryStorage = new LocalRepositoryStorage();

export const repositoryStorageInternals = {
  assertTenantStorageKey,
  storageKeyForUpload,
};
