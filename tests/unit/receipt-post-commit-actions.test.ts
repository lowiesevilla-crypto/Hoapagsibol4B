import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);

// Execute the real action/control flow with isolated IO; no financial database is used.
function load(path: string, mocks: Record<string, unknown>) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} as Record<string, (...args: unknown[]) => Promise<void>> };
  runInNewContext(output, {
    module: loadedModule, exports: loadedModule.exports, Error, console: { error() {} },
    require: (id: string) => {
      if (id in mocks) return mocks[id];
      if (id === "@prisma/client" || id === "node:crypto") return nativeRequire(id);
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return loadedModule.exports;
}

class Redirect extends Error {
  constructor(readonly url: string) { super(url); }
}

const actor = { id: "actor-a", tenantId: "tenant-a", name: "Test Admin" };
const common = {
  "next/navigation": { redirect: (url: string) => { throw new Redirect(url); } },
  "@/lib/authorization/guards": { requirePermission: async () => actor, requirePermissions: async () => actor },
  "@/lib/authorization/permissions": { Permission: {} },
};

test("Petty Cash still opens the committed voucher when every cache refresh throws", async () => {
  const paths: string[] = [];
  const refresh = load("lib/petty-cash/revalidation.ts", {
    "next/cache": { revalidatePath: (path: string) => { paths.push(path); throw new Error("cache unavailable"); } },
  });
  let commits = 0;
  const actions = load("lib/actions/petty-cash.ts", {
    ...common,
    "@/lib/petty-cash/revalidation": refresh,
    "@/lib/petty-cash/constants": {},
    "@/lib/petty-cash/entitlement": { requirePettyCashFeature: async () => undefined },
    "@/lib/tenant": { getEnabledTenantModules: async () => new Set() },
    "@/lib/db": { prisma: { $transaction: async () => { commits++; return "voucher-a"; } } },
  });
  const data = new FormData();
  for (const [key, value] of Object.entries({ transactionDate: "2026-09-17", payeeType: "OTHER", approverType: "ADMIN", itemsJson: '[{"amount":"10"}]' })) data.set(key, value);
  await assert.rejects(actions.createPettyCashVoucherAction(data), (error: unknown) => error instanceof Redirect && error.url === "/admin/petty-cash/voucher-a?success=created");
  assert.equal(commits, 1);
  assert.equal(paths.length, 6, "A failed refresh must not stop later refreshes or receipt navigation");
  assert.ok(paths.includes("/admin/petty-cash/voucher-a"));
});

for (const failCommit of [false, true]) {
  test(`collection ${failCommit ? "rollback stays on the error path" : "commit opens its exact receipt despite cache failures"}`, async () => {
    let receiptCreated = false;
    let refreshes = 0;
    const actions = load("lib/actions/collections.ts", {
      ...common,
      "next/cache": { revalidatePath: () => { refreshes++; throw new Error("cache unavailable"); } },
      "@/lib/bond-refund-errors": {},
      "@/lib/bond-rules": { isRefundableBondType: () => false },
      "@/lib/services/bond-refund": {},
      "@/lib/services/receipt": { allocateReceiptNumber: async () => "AR-TEST", collectionReceiptSeries: () => "AR" },
      "@/lib/tenant-context": { withTenantContext: async (tenantId: string, operation: () => unknown) => { assert.equal(tenantId, actor.tenantId); return operation(); } },
      "@/lib/validation": { collectionSchema: { safeParse: () => ({ success: true, data: { type: "OTHER", payerType: "OTHER", payerName: "Test", description: "Fee", amount: 10, collectionDate: "2026-09-17" } }) } },
      "@/lib/db": { prisma: { $transaction: async (operation: (tx: unknown) => unknown) => {
        if (failCommit) throw new Error("database unavailable");
        return operation({
          collection: { create: async ({ data }: { data: { tenantId: string } }) => { assert.equal(data.tenantId, actor.tenantId); receiptCreated = true; return { id: "collection-a" }; } },
          auditLog: { create: async () => undefined },
        });
      } } },
    });
    await assert.rejects(actions.recordCollectionAction(new FormData()), (error: unknown) => {
      assert.ok(error instanceof Redirect);
      if (failCommit) assert.ok(error.url.startsWith("/admin/collections?collectionError="));
      else assert.equal(error.url, "/receipts/collection/collection-a");
      return true;
    });
    assert.equal(receiptCreated, !failCommit);
    assert.equal(refreshes, failCommit ? 0 : 5);
  });
}

test("all Petty Cash mutations share the post-commit guard", () => {
  const create = readFileSync("lib/actions/petty-cash.ts", "utf8");
  const maintenance = readFileSync("lib/actions/petty-cash-maintenance.ts", "utf8");
  assert.doesNotMatch(create + maintenance, /\brevalidatePath\(/);
  for (const action of ["update", "delete"]) assert.ok(maintenance.includes(`action: "${action}"`));
});

test("receipt recovery retries rendering, never financial submission", () => {
  const component = readFileSync("components/receipt-preview-error.tsx", "utf8");
  assert.match(component, /type="button"[^>]*onClick=\{reset\}/);
  assert.match(component, /Check the saved record before submitting again/);
  assert.doesNotMatch(component, /<form|router\.refresh|recordPayment|createPettyCash/);
  for (const path of ["app/receipts/[kind]/[id]/error.tsx", "app/admin/petty-cash/[id]/error.tsx"]) {
    assert.match(readFileSync(path, "utf8"), /ReceiptPreviewError/);
  }
});


test("production financial forms navigate only after committed action state returns the printable route", () => {
  const paymentPage = readFileSync("app/admin/payments/record/page.tsx", "utf8");
  const paymentForm = readFileSync("components/record-payment-advance-form.tsx", "utf8");
  const collectionForm = readFileSync("components/collection-form.tsx", "utf8");
  const refundForm = readFileSync("components/bond-refund-form.tsx", "utf8");
  const pettyCashForm = readFileSync("components/petty-cash-voucher-form.tsx", "utf8");

  assert.match(paymentPage, /RecordPaymentAdvanceForm[^>]*actionProgressEnabled/);
  assert.match(paymentForm, /useActionState\(recordHomeownerPaymentProgressAction/);
  assert.match(paymentForm, /router\.push\(activeProgressState\.receiptUrl/);

  assert.match(collectionForm, /useActionState\(recordCollectionReceiptStateAction/);
  assert.match(collectionForm, /router\.push\(receiptState\.receiptUrl/);
  assert.doesNotMatch(collectionForm, /action=\{recordCollectionAction\}/);

  assert.match(refundForm, /useActionState\(recordBondRefundAndOpenReceiptAction/);
  assert.match(refundForm, /router\.push\(refundState\.receiptUrl/);

  assert.match(pettyCashForm, /useActionState\(createPettyCashVoucherStateAction/);
  assert.match(pettyCashForm, /router\.push\(voucherState\.voucherUrl/);
  assert.doesNotMatch(pettyCashForm, /action=\{createPettyCashVoucherAction\}/);
});
