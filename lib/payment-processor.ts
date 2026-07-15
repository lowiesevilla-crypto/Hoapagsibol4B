import type { Role } from "@prisma/client";
import { roleLabel } from "@/lib/tenant-roles";

type ProcessorSource = {
  name: string;
  role: Role;
  employeeProfile?: { name: string; position: string } | null;
};

export function paymentProcessorIdentity(processor: ProcessorSource | null, metadata?: unknown) {
  const snapshot = objectValue(objectValue(metadata)?.adminUser);
  const snapshotName = stringValue(snapshot?.name);
  const snapshotRole = stringValue(snapshot?.role);
  return {
    name: snapshotName || processor?.employeeProfile?.name.trim() || processor?.name.trim() || "Authorized HOA Processor",
    role: snapshotRole?.replaceAll("_", " ") || processor?.employeeProfile?.position.trim() || (processor ? roleLabel(processor.role) : "Authorized HOA Processor"),
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
