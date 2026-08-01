import {
  loadApprovedPackages,
  targetTenantId,
} from "@/scripts/pass-template-packages";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const packages = loadApprovedPackages();
assert(packages.length === 2, "two approved pass template packages are present");

for (const { target, pkg } of packages) {
  assert(pkg.contentHash.startsWith("sha256:"), `${target.label} has a deterministic SHA-256 content hash`);
  const content = JSON.stringify(pkg);
  assert(!content.includes("mysql://"), `${target.label} package contains no database URL`);
  assert(!content.includes("Certificate of Residency"), `${target.label} package has no Certificate of Residency wording`);
  assert(!content.includes("HOA Office Copy"), `${target.label} package has no HOA Office Copy wording`);
  assert(!content.includes("Pagsibol Village East 4B"), `${target.label} package has no hardcoded tenant name`);
  assert(content.includes("{{tenant.name}}"), `${target.label} keeps tenant name dynamic`);
  assert(content.includes("{{tenant.address}}"), `${target.label} keeps tenant address dynamic`);
  assert(content.includes("{{tenant.tin}}"), `${target.label} keeps tenant TIN dynamic`);
  assert(content.includes("{{tenant.secRegistration}}"), `${target.label} keeps tenant SEC registration dynamic`);
  assert(content.includes("{{tenant.contactNumber}}"), `${target.label} keeps tenant contact dynamic`);
}

console.log(`Approved pass template package verification passed for ${targetTenantId}.`);
