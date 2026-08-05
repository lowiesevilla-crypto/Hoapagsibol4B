import { readFile, writeFile } from "node:fs/promises";

const file = "tests/e2e/document-workflow.mjs";
const before = await readFile(file, "utf8");
let after = before;

function replaceOnce(search, replacement, label) {
  const first = after.indexOf(search);
  if (first < 0) throw new Error(`missing ${label}`);
  if (after.indexOf(search, first + search.length) >= 0) throw new Error(`duplicate ${label}`);
  after = after.slice(0, first) + replacement + after.slice(first + search.length);
}

replaceOnce(
  '    await login(page, adminEmail, adminPassword, "/admin/");\n    await page.goto(`${baseUrl}/admin/documents/${requestId}`, { waitUntil: "networkidle2", timeout });',
  `    await login(page, adminEmail, adminPassword, "/admin/");

    await page.goto(\`\${baseUrl}/admin/documents/operations\`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Document Operations Command Center");
    await expectText(page, "Production readiness checklist");
    await expectText(page, "Operational CSV export");

    const exportResult = await page.evaluate(async (purpose) => {
      const response = await fetch(\`/admin/documents/export?q=\${encodeURIComponent(purpose)}\`, { credentials: "include" });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        disposition: response.headers.get("content-disposition") || "",
        body: await response.text(),
      };
    }, requestPurpose);
    assert.equal(exportResult.status, 200);
    assert.match(exportResult.contentType, /^text\\/csv/i);
    assert.match(exportResult.disposition, /attachment/i);
    assert.ok(exportResult.body.includes(requestPurpose), "Expected the filtered export to contain the tenant request.");
    assert.ok(!exportResult.body.includes(secondaryTenantId), "The export must not contain another tenant identifier.");

    await page.goto(\`\${baseUrl}/admin/documents/guide\`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Administrator Runbook");
    await expectText(page, "Daily operating checklist");

    await page.goto(\`\${baseUrl}/admin/documents/\${requestId}\`, { waitUntil: "networkidle2", timeout });`,
  "administrator document detail navigation",
);

replaceOnce(
  '    await expectText(page, "View Document");\n\n    await page.goto(`${baseUrl}/documents/${request.id}`, { waitUntil: "networkidle2", timeout });',
  `    await expectText(page, "View Document");

    await page.goto(\`\${baseUrl}/portal/documents/guide\`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Document Request Guide");
    await expectText(page, "Viewing, downloading, printing, and verification");

    await page.goto(\`\${baseUrl}/documents/\${request.id}\`, { waitUntil: "networkidle2", timeout });`,
  "homeowner generated document navigation",
);

replaceOnce(
  '    await page.goto(`${baseUrl}/portal/dashboard`, { waitUntil: "networkidle2", timeout });\n    const denial = await page.evaluate(async (url) => {',
  `    await page.goto(\`\${baseUrl}/admin/documents/operations\`, { waitUntil: "networkidle2", timeout }).catch(() => undefined);
    assert.ok(!(await pageText(page)).includes("Document Operations Command Center"), "A homeowner must not access administrator documentation operations.");

    await page.goto(\`\${baseUrl}/portal/dashboard\`, { waitUntil: "networkidle2", timeout });
    const exportDenial = await page.evaluate(async () => {
      const response = await fetch("/admin/documents/export", { credentials: "include", redirect: "manual" });
      return { status: response.status, type: response.headers.get("content-type") || "" };
    });
    assert.ok(exportDenial.status !== 200 || !exportDenial.type.startsWith("text/csv"), "A homeowner must not download the administrator CSV export.");

    const denial = await page.evaluate(async (url) => {`,
  "cross-tenant document PDF denial",
);

replaceOnce(
  '  console.log("- tenant-scoped administrator review passed");\n  console.log("- approval and official document generation passed");',
  '  console.log("- tenant-scoped administrator readiness, runbook, and filtered export passed");\n  console.log("- approval and official document generation passed");',
  "browser result summary",
);
replaceOnce(
  '  console.log("- homeowner document view and PDF download passed");\n  console.log("- cross-tenant document access denial passed");',
  '  console.log("- homeowner guide, document view, and PDF download passed");\n  console.log("- cross-tenant document access and administrator-export denial passed");',
  "browser access summary",
);

if (after === before) throw new Error("Expected documentation browser changes were not applied.");
await writeFile(file, after);
console.log("documentation operations browser coverage applied");
