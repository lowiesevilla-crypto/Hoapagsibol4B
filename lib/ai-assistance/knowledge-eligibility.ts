import { RepositoryMalwareScanStatus } from "@prisma/client";

export const AI_ALLOWED_REPOSITORY_MALWARE_STATUS = RepositoryMalwareScanStatus.PASSED;

export function isAiRepositoryDocumentMalwareValidated(status: RepositoryMalwareScanStatus | string | null | undefined) {
  return status === AI_ALLOWED_REPOSITORY_MALWARE_STATUS;
}

export function aiRepositoryDocumentMalwareWhere() {
  return { equals: AI_ALLOWED_REPOSITORY_MALWARE_STATUS };
}
