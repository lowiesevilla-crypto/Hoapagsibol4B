import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("admin document management exposes all primary sections and direct issuance", async () => {
  const layout = await source("app/admin/documents/layout.tsx");

  assert.match(layout, /href: "\/admin\/documents\?section=types"/);
  assert.match(layout, /href: "\/admin\/documents\?section=templates"/);
  assert.match(layout, /href: "\/admin\/documents\?section=requests&view=all"/);
  assert.match(layout, /href: "\/admin\/documents\?section=issued"/);
  assert.match(layout, /href="\/admin\/documents\/new"/);
  assert.match(layout, />\+ Issue Document<\/Link>/);
});

test("issued documents and document detail keep print actions visible", async () => {
  const documentsPage = await source("app/admin/documents/page.tsx");
  const adminDetail = await source("app/admin/documents/[id]/page.tsx");

  assert.match(documentsPage, /href={`\/documents\/\$\{item\.id\}\/print`}>Print<\/a>/);
  assert.match(adminDetail, /href={`\/documents\/\$\{request\.id\}\/print`}[^>]*>Print document<\/a>/);
});
