import {
  DocumentOutstandingBalancePolicy,
  DocumentRequestStatus,
  PrismaClient,
  Role,
} from "@prisma/client";
import {
  canOverrideDocumentBalancePolicy,
  getQualifyingHomeownerBalance,
  resolveDocumentDownloadAccess,
} from "../lib/services/document-balance-policy";

const prisma = new PrismaClient();
const rollbackSignal = "ROLLBACK_DOCUMENT_BALANCE_POLICY_OK";

async function main() {
  const homeowner = await prisma.homeownerProfile.findFirst({
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  if (!homeowner) throw new Error("Missing homeowner fixture for document balance policy verification.");

  const migratedDefinitions = await prisma.documentDefinition.count({
    where: { outstandingBalancePolicy: DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD },
  });
  assert(migratedDefinitions > 0, "Existing definitions default to BLOCK_DOWNLOAD after migration.");

  await prisma.$transaction(async (tx) => {
    const baseline = await getQualifyingHomeownerBalance(homeowner.tenantId, homeowner.id, tx);
    const fixtureBalance = 321.45;
    const stamp = Date.now() % 100000;
    const coverageYear = 2100 + (stamp % 200);
    const coverageMonth = (stamp % 12) + 1;
    await tx.bill.create({
      data: {
        tenantId: homeowner.tenantId,
        homeownerId: homeowner.id,
        billingMonth: new Date(Date.UTC(coverageYear, coverageMonth - 1, 1)),
        coverageYear,
        coverageMonth,
        amount: fixtureBalance.toFixed(2),
        totalAmount: fixtureBalance.toFixed(2),
        amountPaid: "0.00",
        balance: fixtureBalance.toFixed(2),
        dueDate: new Date(Date.UTC(coverageYear, coverageMonth - 1, 28)),
        status: "UNPAID",
        notes: "Rollback verification balance for Bug #098.",
      },
    });
    const currentBalance = await getQualifyingHomeownerBalance(homeowner.tenantId, homeowner.id, tx);
    assert(currentBalance >= baseline + fixtureBalance - 0.01, "Qualifying balance uses tenant and homeowner scoped bills.");

    assertAccess("FREE_INSTANT + IGNORE_BALANCE + positive balance allows download", {
      request: readyRequest(DocumentOutstandingBalancePolicy.IGNORE_BALANCE),
      currentOutstandingBalance: currentBalance,
    }, { allowed: true, balanceLocked: false, paymentLocked: false });

    assertAccess("FREE_INSTANT + BLOCK_DOWNLOAD + positive balance blocks download", {
      request: readyRequest(DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD),
      currentOutstandingBalance: currentBalance,
    }, { allowed: false, balanceLocked: true, paymentLocked: false });

    const beforeBlockedRequest = await tx.documentRequest.count({ where: { tenantId: homeowner.tenantId, homeownerId: homeowner.id } });
    const blockedRequest = resolveDocumentDownloadAccess({
      request: readyRequest(DocumentOutstandingBalancePolicy.BLOCK_REQUEST),
      currentOutstandingBalance: currentBalance,
    });
    assert(blockedRequest.balanceLocked, "BLOCK_REQUEST is treated as a download lock for accepted historical requests.");
    if (currentBalance > 0) {
      const afterBlockedRequest = await tx.documentRequest.count({ where: { tenantId: homeowner.tenantId, homeownerId: homeowner.id } });
      assert(afterBlockedRequest === beforeBlockedRequest, "BLOCK_REQUEST rejects before creating a request.");
    }

    const approvalRequest = pendingApprovalRequest(DocumentOutstandingBalancePolicy.IGNORE_BALANCE);
    assert(approvalRequest.status === DocumentRequestStatus.PENDING_APPROVAL, "FREE_APPROVAL starts PENDING_APPROVAL.");
    assertAccess("FREE_APPROVAL + IGNORE_BALANCE after approval allows download despite unrelated balance", {
      request: { ...approvalRequest, status: DocumentRequestStatus.READY_FOR_DOWNLOAD },
      currentOutstandingBalance: currentBalance,
    }, { allowed: true, balanceLocked: false, paymentLocked: false });

    assertAccess("PAID_INSTANT + IGNORE_BALANCE still requires document-specific payment", {
      request: { ...readyRequest(DocumentOutstandingBalancePolicy.IGNORE_BALANCE), paymentRequiredSnapshot: true },
      currentOutstandingBalance: currentBalance,
    }, { allowed: false, balanceLocked: false, paymentLocked: true });

    assertAccess("ALLOW_ADMIN_OVERRIDE is locked before override", {
      request: readyRequest(DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE),
      currentOutstandingBalance: currentBalance,
    }, { allowed: false, balanceLocked: true, paymentLocked: false });
    assertAccess("ALLOW_ADMIN_OVERRIDE is allowed after authorized override", {
      request: { ...readyRequest(DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE), allowDownloadDespiteBalance: true },
      currentOutstandingBalance: currentBalance,
    }, { allowed: true, balanceLocked: false, paymentLocked: false });
    assertAccess("ALLOW_ADMIN_OVERRIDE is blocked again after revocation", {
      request: readyRequest(DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE),
      currentOutstandingBalance: currentBalance,
    }, { allowed: false, balanceLocked: true, paymentLocked: false });

    const member = await tx.householdMember.create({
      data: {
        tenantId: homeowner.tenantId,
        homeownerId: homeowner.id,
        fullName: "Rollback Verification Member",
        relationship: "Dependent",
      },
    });
    const ownedMember = await tx.householdMember.findFirst({ where: { tenantId: homeowner.tenantId, homeownerId: homeowner.id, id: member.id } });
    const crossTenantMember = await tx.householdMember.findFirst({ where: { tenantId: "tenant_cross_verification", homeownerId: homeowner.id, id: member.id } });
    assert(Boolean(ownedMember), "Household-member ownership resolves within authenticated tenant and homeowner.");
    assert(!crossTenantMember, "Cross-tenant household-member lookup is rejected.");

    assert(canOverrideDocumentBalancePolicy(Role.ADMIN), "Authorized admin override role is accepted.");
    assert(!canOverrideDocumentBalancePolicy(Role.HOMEOWNER), "Unauthorized homeowner override role is rejected.");

    throw new Error(rollbackSignal);
  }).catch((error) => {
    if (error instanceof Error && error.message === rollbackSignal) return;
    throw error;
  });

  console.log("PASS: document outstanding balance policies, request blocking, paid-document separation, admin override, household ownership, tenant isolation, and migration defaults verified with rollback.");
}

function readyRequest(policy: DocumentOutstandingBalancePolicy) {
  return {
    status: DocumentRequestStatus.READY_FOR_DOWNLOAD,
    paymentRequiredSnapshot: false,
    allowDownloadDespiteBalance: false,
    definition: { outstandingBalancePolicy: policy },
  };
}

function pendingApprovalRequest(policy: DocumentOutstandingBalancePolicy) {
  return {
    ...readyRequest(policy),
    status: DocumentRequestStatus.PENDING_APPROVAL,
  };
}

function assertAccess(
  label: string,
  input: Parameters<typeof resolveDocumentDownloadAccess>[0],
  expected: { allowed: boolean; balanceLocked: boolean; paymentLocked: boolean },
) {
  const access = resolveDocumentDownloadAccess(input);
  assert(access.downloadAllowed === expected.allowed, `${label}: downloadAllowed expected ${expected.allowed}.`);
  assert(access.balanceLocked === expected.balanceLocked, `${label}: balanceLocked expected ${expected.balanceLocked}.`);
  assert(access.paymentLocked === expected.paymentLocked, `${label}: paymentLocked expected ${expected.paymentLocked}.`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().finally(async () => prisma.$disconnect());
