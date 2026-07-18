import {
  DocumentOutstandingBalancePolicy,
  DocumentRequestStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { money } from "@/lib/utils";

export const defaultDocumentOutstandingBalancePolicy = DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD;

export const documentOutstandingBalancePolicyOptions = [
  {
    value: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    label: "Ignore Outstanding Balance",
    helper: "Existing HOA balances will not prevent this document from being requested, downloaded, or printed.",
  },
  {
    value: DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD,
    label: "Block Download When Balance Exists",
    helper: "The request may proceed, but download and printing remain locked until the qualifying balance is settled.",
  },
  {
    value: DocumentOutstandingBalancePolicy.BLOCK_REQUEST,
    label: "Block Request When Balance Exists",
    helper: "The homeowner cannot submit this request while a qualifying balance exists.",
  },
  {
    value: DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE,
    label: "Allow Admin Override",
    helper: "Download is normally blocked, but an authorized administrator may permit release for an individual request.",
  },
] as const;

export function normalizeOutstandingBalancePolicy(value: unknown) {
  const policy = String(value || "");
  return Object.values(DocumentOutstandingBalancePolicy).includes(policy as DocumentOutstandingBalancePolicy)
    ? policy as DocumentOutstandingBalancePolicy
    : null;
}

export async function getQualifyingHomeownerBalance(
  tenantId: string,
  homeownerId: string,
  client: Pick<Prisma.TransactionClient, "bill"> = prisma as unknown as Pick<Prisma.TransactionClient, "bill">,
) {
  const unpaid = await client.bill.aggregate({
    where: { tenantId, homeownerId, archivedAt: null, balance: { gt: 0 } },
    _sum: { balance: true },
  });
  return Number(unpaid._sum.balance ?? 0);
}

export type DocumentAccessPolicyRequest = {
  status: DocumentRequestStatus | string;
  paymentRequiredSnapshot: boolean;
  allowDownloadDespiteBalance: boolean;
  definition?: { outstandingBalancePolicy: DocumentOutstandingBalancePolicy } | null;
};

export function policyForDocumentRequest(request: { definition?: { outstandingBalancePolicy: DocumentOutstandingBalancePolicy } | null }) {
  return request.definition?.outstandingBalancePolicy ?? defaultDocumentOutstandingBalancePolicy;
}

export function isDocumentReadyForDownload(status: DocumentRequestStatus | string) {
  return status === DocumentRequestStatus.READY_FOR_DOWNLOAD || status === DocumentRequestStatus.GENERATED || status === DocumentRequestStatus.DOWNLOADED;
}

export function resolveDocumentDownloadAccess(input: {
  request: DocumentAccessPolicyRequest;
  currentOutstandingBalance: number;
}) {
  const { request, currentOutstandingBalance } = input;
  const policy = policyForDocumentRequest(request);
  const paymentLocked = request.paymentRequiredSnapshot;
  const hasBalance = currentOutstandingBalance > 0.009;
  const balanceLocked = hasBalance && (
    policy === DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD ||
    policy === DocumentOutstandingBalancePolicy.BLOCK_REQUEST ||
    (policy === DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE && !request.allowDownloadDespiteBalance)
  );
  const ready = isDocumentReadyForDownload(request.status);
  const downloadAllowed = ready && !paymentLocked && !balanceLocked;
  const message = paymentLocked
    ? "Download is locked until document fee payment is confirmed."
    : balanceLocked
      ? balancePolicyLockMessage(policy, currentOutstandingBalance)
      : null;
  return { policy, ready, paymentLocked, balanceLocked, downloadAllowed, message };
}

export function balancePolicyLockMessage(policy: DocumentOutstandingBalancePolicy, amount: number) {
  if (policy === DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE) {
    return `Download and printing require balance clearance or an authorized HOA override. Your current qualifying balance is ${money(amount)}.`;
  }
  if (policy === DocumentOutstandingBalancePolicy.BLOCK_REQUEST) {
    return `This document cannot be requested while your current qualifying HOA balance is ${money(amount)}. Please settle the balance or contact the HOA office.`;
  }
  return `Download and printing are locked because your current qualifying HOA balance is ${money(amount)}. You may still view and verify this document.`;
}

export function canOverrideDocumentBalancePolicy(role: Role) {
  const allowedRoles: Role[] = [Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.SUPER_ADMIN, Role.PLATFORM_ADMIN];
  return allowedRoles.includes(role);
}
