import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PlatformPaymentGateway, PlatformPaymentMethod, Role, TenantStatus } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { hardDeletePlatformTenant } from "@/lib/services/platform-tenant-lifecycle";

const runId = `platform-tenant-delete-it-${process.pid}-${Date.now()}`;
const controlTenantId = `${runId}-control`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const actorId = `${runId}-actor`;
const tenantASlug = `${runId}-a`;
const tenantBSlug = `${runId}-b`;

const workflowAId = `${runId}-workflow-a`;
const workflowBId = `${runId}-workflow-b`;
const definitionAId = `${runId}-definition-a`;
const definitionBId = `${runId}-definition-b`;
const templateSetAId = `${runId}-template-set-a`;
const templateSetBId = `${runId}-template-set-b`;
const templateVersionAId = `${runId}-template-version-a`;
const templateVersionBId = `${runId}-template-version-b`;
const paymentAId = `${runId}-payment-a`;
const paymentBId = `${runId}-payment-b`;

async function removeDocumentFixtures(tenantId: string) {
  await platformPrisma.documentDefinition.updateMany({
    where: { tenantId },
    data: { assignedTemplateVersionId: null, workflowDefinitionId: null },
  });
  await platformPrisma.documentTemplateVersion.deleteMany({ where: { tenantId } });
  await platformPrisma.documentTemplateSet.deleteMany({ where: { tenantId } });
  await platformPrisma.documentWorkflowDefinition.deleteMany({ where: { tenantId } });
  await platformPrisma.documentDefinition.deleteMany({ where: { tenantId } });
}

async function cleanFixtures() {
  for (const tenantId of [tenantAId, tenantBId]) {
    await removeDocumentFixtures(tenantId);
    await platformPrisma.platformPayment.deleteMany({ where: { tenantId } });
    await platformPrisma.auditLog.deleteMany({ where: { tenantId } });
    await platformPrisma.user.deleteMany({ where: { tenantId } });
  }

  await platformPrisma.auditLog.deleteMany({ where: { tenantId: controlTenantId } });
  await platformPrisma.user.deleteMany({ where: { tenantId: controlTenantId } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId, controlTenantId] } } });
}

async function createDocumentCycle(input: {
  tenantId: string;
  workflowId: string;
  definitionId: string;
  templateSetId: string;
  templateVersionId: string;
  suffix: string;
}) {
  await platformPrisma.documentWorkflowDefinition.create({
    data: {
      tenantId: input.tenantId,
      id: input.workflowId,
      code: `${runId}-workflow-${input.suffix}`,
      name: `Workflow ${input.suffix}`,
    },
  });

  await platformPrisma.documentDefinition.create({
    data: {
      tenantId: input.tenantId,
      id: input.definitionId,
      code: `${runId}-definition-${input.suffix}`,
      displayName: `Definition ${input.suffix}`,
      workflowDefinitionId: input.workflowId,
    },
  });

  await platformPrisma.documentTemplateSet.create({
    data: {
      tenantId: input.tenantId,
      id: input.templateSetId,
      definitionId: input.definitionId,
      name: `Template Set ${input.suffix}`,
    },
  });

  await platformPrisma.documentTemplateVersion.create({
    data: {
      tenantId: input.tenantId,
      id: input.templateVersionId,
      templateSetId: input.templateSetId,
      version: 1,
      definitionJson: { title: `Template ${input.suffix}` },
    },
  });

  await platformPrisma.documentDefinition.update({
    where: { id: input.definitionId },
    data: { assignedTemplateVersionId: input.templateVersionId },
  });
}

before(async () => {
  await cleanFixtures();

  await platformPrisma.tenant.createMany({
    data: [
      {
        id: controlTenantId,
        name: "Platform Control Tenant",
        shortName: "CONTROL",
        slug: `${runId}-control`,
        status: TenantStatus.ACTIVE,
      },
      {
        id: tenantAId,
        name: "Tenant A To Delete",
        shortName: "TENANT-A",
        slug: tenantASlug,
        status: TenantStatus.INACTIVE,
      },
      {
        id: tenantBId,
        name: "Tenant B Must Remain",
        shortName: "TENANT-B",
        slug: tenantBSlug,
        status: TenantStatus.ACTIVE,
      },
    ],
  });

  await platformPrisma.user.create({
    data: {
      tenantId: controlTenantId,
      id: actorId,
      name: "Platform Admin Test Actor",
      email: `${runId}@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.PLATFORM_ADMIN,
    },
  });

  await createDocumentCycle({
    tenantId: tenantAId,
    workflowId: workflowAId,
    definitionId: definitionAId,
    templateSetId: templateSetAId,
    templateVersionId: templateVersionAId,
    suffix: "A",
  });
  await createDocumentCycle({
    tenantId: tenantBId,
    workflowId: workflowBId,
    definitionId: definitionBId,
    templateSetId: templateSetBId,
    templateVersionId: templateVersionBId,
    suffix: "B",
  });

  await platformPrisma.platformPayment.createMany({
    data: [
      {
        id: paymentAId,
        tenantId: tenantAId,
        paymentReference: `${runId}-payment-ref-a`,
        gateway: PlatformPaymentGateway.MANUAL,
        amount: 100,
        netAmount: 100,
        method: PlatformPaymentMethod.CASH,
      },
      {
        id: paymentBId,
        tenantId: tenantBId,
        paymentReference: `${runId}-payment-ref-b`,
        gateway: PlatformPaymentGateway.MANUAL,
        amount: 200,
        netAmount: 200,
        method: PlatformPaymentMethod.CASH,
      },
    ],
  });
});

after(async () => {
  await cleanFixtures();
});

test("permanent tenant deletion breaks the document dependency cycle only inside the target tenant", async () => {
  const result = await hardDeletePlatformTenant({
    tenantId: tenantAId,
    actorId,
    actorTenantId: controlTenantId,
    confirmationSlug: tenantASlug,
    confirmationWord: "DELETE",
  });

  assert.equal(result.deletedTenantId, tenantAId);
  assert.equal(await platformPrisma.tenant.findUnique({ where: { id: tenantAId } }), null);
  assert.equal(await platformPrisma.documentDefinition.findUnique({ where: { id: definitionAId } }), null);
  assert.equal(await platformPrisma.documentTemplateSet.findUnique({ where: { id: templateSetAId } }), null);
  assert.equal(await platformPrisma.documentTemplateVersion.findUnique({ where: { id: templateVersionAId } }), null);
  assert.equal(await platformPrisma.documentWorkflowDefinition.findUnique({ where: { id: workflowAId } }), null);
  assert.equal(await platformPrisma.platformPayment.findUnique({ where: { id: paymentAId } }), null);

  const tenantB = await platformPrisma.tenant.findUnique({ where: { id: tenantBId } });
  const definitionB = await platformPrisma.documentDefinition.findUnique({ where: { id: definitionBId } });
  const templateSetB = await platformPrisma.documentTemplateSet.findUnique({ where: { id: templateSetBId } });
  const templateVersionB = await platformPrisma.documentTemplateVersion.findUnique({ where: { id: templateVersionBId } });
  const workflowB = await platformPrisma.documentWorkflowDefinition.findUnique({ where: { id: workflowBId } });
  const paymentB = await platformPrisma.platformPayment.findUnique({ where: { id: paymentBId } });

  assert.equal(tenantB?.id, tenantBId);
  assert.equal(tenantB?.status, TenantStatus.ACTIVE);
  assert.equal(definitionB?.assignedTemplateVersionId, templateVersionBId);
  assert.equal(definitionB?.workflowDefinitionId, workflowBId);
  assert.equal(templateSetB?.definitionId, definitionBId);
  assert.equal(templateVersionB?.templateSetId, templateSetBId);
  assert.equal(workflowB?.id, workflowBId);
  assert.equal(paymentB?.amount.toString(), "200");

  const deletionAudit = await platformPrisma.auditLog.findFirst({
    where: {
      tenantId: controlTenantId,
      action: "TENANT_HARD_DELETED",
      entityType: "Tenant",
      entityId: tenantAId,
    },
  });
  assert.ok(deletionAudit);
});