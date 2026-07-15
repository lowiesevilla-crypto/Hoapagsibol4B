import Module from "node:module";
import { SystemSettingCategory } from "@prisma/client";
import { platformPrisma } from "../lib/db";
import { withTenantContext } from "../lib/tenant-context";

const moduleLoader = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = moduleLoader._load;
moduleLoader._load = function loadForVerification(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  const [{ getAssociationSettings, getChatSettings, getPasswordPolicy, getPaymentSettings, getSystemSettingMap }, { getMailConfiguration }] = await Promise.all([
    import("../lib/system-settings"),
    import("../lib/services/notifications"),
  ]);
  const tenants = await platformPrisma.tenant.findMany({
    where: { OR: [{ slug: "test-hoa" }, { id: "tenant_pagsibol4b_default" }] },
    select: { id: true, slug: true, name: true },
  });
  const testHoa = tenants.find((tenant) => tenant.slug === "test-hoa");
  const pagsibol = tenants.find((tenant) => tenant.id === "tenant_pagsibol4b_default");
  if (!testHoa || !pagsibol) throw new Error("Both Test HOA and Pagsibol tenants are required for settings isolation verification.");

  const readTenant = (tenantId: string) => withTenantContext(tenantId, async () => {
    const [map, association, payment, password, chat, mail] = await Promise.all([
      getSystemSettingMap(tenantId),
      getAssociationSettings(tenantId),
      getPaymentSettings(tenantId),
      getPasswordPolicy(tenantId),
      getChatSettings(tenantId),
      getMailConfiguration(tenantId),
    ]);
    return { map, association, payment, password, chat, mail };
  });
  const [testSettings, pagsibolSettings] = await Promise.all([readTenant(testHoa.id), readTenant(pagsibol.id)]);
  const saved = (map: typeof testSettings.map, category: SystemSettingCategory, key: string) => map.get(`${category}.${key}`)?.value?.trim() || "";
  const checks: Array<[boolean, string]> = [
    [testHoa.id !== pagsibol.id, "tenant identifiers are distinct"],
    [testSettings.association.name.toLowerCase() === testHoa.name.toLowerCase(), "Test HOA association profile resolves from Test HOA"],
    [pagsibolSettings.association.name === pagsibol.name, "Pagsibol association profile resolves from Pagsibol"],
    [testSettings.association.name !== pagsibolSettings.association.name, "association names do not cross tenants"],
    [testSettings.association.address === (saved(testSettings.map, SystemSettingCategory.ASSOCIATION, "ASSOCIATION_ADDRESS") || testHoa.name), "Test HOA address uses its own setting row"],
    [testSettings.association.logoUrl === saved(testSettings.map, SystemSettingCategory.ASSOCIATION, "ASSOCIATION_LOGO_URL"), "Test HOA logo uses its own setting row"],
    [testSettings.association.tinNumber === saved(testSettings.map, SystemSettingCategory.ASSOCIATION, "ASSOCIATION_TIN_NUMBER"), "Test HOA TIN uses its own setting row"],
    [testSettings.association.secRegistrationNumber === saved(testSettings.map, SystemSettingCategory.ASSOCIATION, "ASSOCIATION_SEC_REGISTRATION_NUMBER"), "Test HOA SEC registration uses its own setting row"],
    [testSettings.payment.gcashQrImageUrl === saved(testSettings.map, SystemSettingCategory.PAYMENT, "GCASH_QR_IMAGE_URL"), "Test HOA GCash QR uses its own setting row"],
    [testSettings.payment.gcashMobileNumber === saved(testSettings.map, SystemSettingCategory.PAYMENT, "GCASH_MOBILE_NUMBER"), "Test HOA GCash number uses its own setting row"],
    [testSettings.mail.credentialSource === "none", "Test HOA does not inherit Pagsibol SMTP credentials"],
    [Number.isFinite(testSettings.password.minLength) && Number.isFinite(pagsibolSettings.password.minLength), "password policies resolve independently"],
    [testSettings.chat.allowedMimeTypes.length > 0 && pagsibolSettings.chat.allowedMimeTypes.length > 0, "chat settings resolve independently"],
    [[...testSettings.map.values()].every((setting) => setting.tenantId === testHoa.id), "Test HOA settings map contains only Test HOA rows"],
    [[...pagsibolSettings.map.values()].every((setting) => setting.tenantId === pagsibol.id), "Pagsibol settings map contains only Pagsibol rows"],
  ];

  const testSentinelKey = "UAT_TEST_HOA_ISOLATION_SENTINEL";
  const pagsibolSentinelKey = "UAT_PAGSIBOL_ISOLATION_SENTINEL";
  class RollbackVerification extends Error {}
  try {
    await platformPrisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { tenantId_category_key: { tenantId: testHoa.id, category: SystemSettingCategory.ASSOCIATION, key: testSentinelKey } },
        create: { tenantId: testHoa.id, category: SystemSettingCategory.ASSOCIATION, key: testSentinelKey, label: "UAT sentinel", value: "TEST-HOA-ONLY" },
        update: { value: "TEST-HOA-ONLY" },
      });
      await tx.systemSetting.upsert({
        where: { tenantId_category_key: { tenantId: pagsibol.id, category: SystemSettingCategory.ASSOCIATION, key: pagsibolSentinelKey } },
        create: { tenantId: pagsibol.id, category: SystemSettingCategory.ASSOCIATION, key: pagsibolSentinelKey, label: "UAT sentinel", value: "PAGSIBOL-ONLY" },
        update: { value: "PAGSIBOL-ONLY" },
      });
      const pagsibolLeak = await tx.systemSetting.count({ where: { tenantId: pagsibol.id, category: SystemSettingCategory.ASSOCIATION, key: testSentinelKey } });
      const testHoaLeak = await tx.systemSetting.count({ where: { tenantId: testHoa.id, category: SystemSettingCategory.ASSOCIATION, key: pagsibolSentinelKey } });
      checks.push([pagsibolLeak === 0, "a Test HOA write does not alter Pagsibol settings"]);
      checks.push([testHoaLeak === 0, "a Pagsibol write does not alter Test HOA settings"]);
      throw new RollbackVerification("rollback");
    });
  } catch (error) {
    if (!(error instanceof RollbackVerification)) throw error;
  }
  const persistedSentinels = await platformPrisma.systemSetting.count({ where: { key: { in: [testSentinelKey, pagsibolSentinelKey] } } });
  checks.push([persistedSentinels === 0, "isolation sentinel was rolled back cleanly"]);

  const failures = checks.filter(([passed]) => !passed);
  if (failures.length) throw new Error(failures.map(([, label]) => `FAIL: ${label}`).join("\n"));
  console.log(`PASS ${checks.length} tenant settings isolation checks`);
  for (const [, label] of checks) console.log(`- ${label}`);
}

main().finally(async () => platformPrisma.$disconnect());
