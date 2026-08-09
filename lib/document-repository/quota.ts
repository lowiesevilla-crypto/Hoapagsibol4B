import { REPOSITORY_QUOTA_WARNING_THRESHOLDS } from "@/lib/document-repository/constants";

const BYTES_PER_MB = 1024 * 1024;

export type RepositoryQuotaState = "UNLIMITED" | "HEALTHY" | "WARNING" | "CRITICAL" | "AT_LIMIT" | "OVER_LIMIT";

export type RepositoryQuotaEvaluation = {
  usedBytes: bigint;
  limitBytes: bigint | null;
  requestedBytes: bigint;
  projectedBytes: bigint;
  remainingBytes: bigint | null;
  utilization: number | null;
  state: RepositoryQuotaState;
  canWrite: boolean;
};

function toSafeBigInt(value: bigint | number) {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid storage byte value.");
  return BigInt(value);
}

export function storageLimitBytes(maximumStorageMb: number | null | undefined) {
  if (maximumStorageMb == null) return null;
  if (!Number.isSafeInteger(maximumStorageMb) || maximumStorageMb < 0) throw new Error("Invalid subscription storage limit.");
  return BigInt(maximumStorageMb) * BigInt(BYTES_PER_MB);
}

export function evaluateRepositoryQuota(input: {
  usedBytes: bigint | number;
  maximumStorageMb?: number | null;
  requestedBytes?: bigint | number;
}): RepositoryQuotaEvaluation {
  const usedBytes = toSafeBigInt(input.usedBytes);
  const requestedBytes = toSafeBigInt(input.requestedBytes ?? 0);
  const projectedBytes = usedBytes + requestedBytes;
  const limitBytes = storageLimitBytes(input.maximumStorageMb);

  if (limitBytes === null) {
    return {
      usedBytes,
      limitBytes,
      requestedBytes,
      projectedBytes,
      remainingBytes: null,
      utilization: null,
      state: "UNLIMITED",
      canWrite: true,
    };
  }

  if (limitBytes === 0n) {
    return {
      usedBytes,
      limitBytes,
      requestedBytes,
      projectedBytes,
      remainingBytes: 0n,
      utilization: usedBytes > 0n ? Number.POSITIVE_INFINITY : 1,
      state: usedBytes > 0n ? "OVER_LIMIT" : "AT_LIMIT",
      canWrite: false,
    };
  }

  const utilization = Number(usedBytes) / Number(limitBytes);
  const projectedUtilization = Number(projectedBytes) / Number(limitBytes);
  const remainingBytes = usedBytes >= limitBytes ? 0n : limitBytes - usedBytes;
  const canWrite = requestedBytes === 0n ? usedBytes <= limitBytes : projectedBytes <= limitBytes;

  let state: RepositoryQuotaState = "HEALTHY";
  if (usedBytes > limitBytes) state = "OVER_LIMIT";
  else if (usedBytes === limitBytes) state = "AT_LIMIT";
  else if (utilization >= REPOSITORY_QUOTA_WARNING_THRESHOLDS[1]) state = "CRITICAL";
  else if (utilization >= REPOSITORY_QUOTA_WARNING_THRESHOLDS[0]) state = "WARNING";

  if (requestedBytes > 0n && projectedUtilization > 1) {
    return { usedBytes, limitBytes, requestedBytes, projectedBytes, remainingBytes, utilization, state, canWrite: false };
  }

  return { usedBytes, limitBytes, requestedBytes, projectedBytes, remainingBytes, utilization, state, canWrite };
}

export function assertRepositoryQuota(input: {
  usedBytes: bigint | number;
  maximumStorageMb?: number | null;
  requestedBytes: bigint | number;
}) {
  const quota = evaluateRepositoryQuota(input);
  if (!quota.canWrite) {
    throw new Error("Document Management storage limit reached. Delete unused files or upgrade the tenant plan before uploading or replacing documents.");
  }
  return quota;
}

export function formatRepositoryStorage(bytes: bigint) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return `${bytes.toString()} bytes`;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
  return `${value} bytes`;
}
