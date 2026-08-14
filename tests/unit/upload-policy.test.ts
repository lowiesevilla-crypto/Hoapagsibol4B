import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HOAHUB_ALLOWED_UPLOAD_EXTENSIONS,
  validateHoaHubUpload,
} from "../../lib/upload-policy";

const pdf = Uint8Array.from(Buffer.from("%PDF-1.7\n"));
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

function validate(fileName: string, contentType: string, data: Uint8Array) {
  return validateHoaHubUpload({ fileName, contentType, size: data.byteLength, data });
}

test("HOAHub global upload allowlist contains only the seven approved extensions", () => {
  assert.deepEqual([...HOAHUB_ALLOWED_UPLOAD_EXTENSIONS], [".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx", ".pptx"]);
});

test("HOAHub accepts the approved PDF, image, and Office Open XML formats", () => {
  assert.equal(validate("policy.pdf", "application/pdf", pdf).extension, ".pdf");
  assert.equal(validate("photo.jpg", "image/jpeg", jpg).extension, ".jpg");
  assert.equal(validate("photo.jpeg", "image/jpeg", jpg).extension, ".jpeg");
  assert.equal(validate("scan.png", "image/png", png).extension, ".png");
  assert.equal(validate("memo.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip).extension, ".docx");
  assert.equal(validate("ledger.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip).extension, ".xlsx");
  assert.equal(validate("briefing.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip).extension, ".pptx");
});

test("HOAHub rejects legacy Office, WebP, CSV, text, executable, and renamed files", () => {
  for (const [fileName, contentType] of [
    ["legacy.doc", "application/msword"],
    ["legacy.xls", "application/vnd.ms-excel"],
    ["legacy.ppt", "application/vnd.ms-powerpoint"],
    ["image.webp", "image/webp"],
    ["import.csv", "text/csv"],
    ["note.txt", "text/plain"],
    ["payload.exe", "application/octet-stream"],
  ] as const) {
    assert.throws(() => validate(fileName, contentType, pdf), /Allowed file types/);
  }
  assert.throws(() => validate("renamed.pdf", "image/jpeg", jpg), /does not match/);
  assert.throws(() => validate("renamed.jpg", "image/jpeg", pdf), /JPEG signature/);
});

test("stored admin and homeowner upload surfaces enforce the central policy", async () => {
  const files = await Promise.all([
    readFile("lib/document-repository/validation.ts", "utf8"),
    readFile("lib/payment-proofs.ts", "utf8"),
    readFile("lib/organization-uploads.ts", "utf8"),
    readFile("lib/content-images.ts", "utf8"),
    readFile("lib/gcash-qr.ts", "utf8"),
    readFile("lib/tenant-logo.ts", "utf8"),
    readFile("lib/actions/complaints.ts", "utf8"),
    readFile("app/api/chat/upload/route.ts", "utf8"),
  ]);
  for (const source of files) assert.match(source, /validateHoaHubUpload|HOAHUB_ALLOWED_UPLOAD_EXTENSIONS/);
  for (const source of files.slice(0, 6)) assert.doesNotMatch(source, /image\/webp|\.webp/);
});

test("admin, homeowner, platform, and chat upload pickers no longer advertise legacy or WebP formats", async () => {
  const pickerSources = await Promise.all([
    readFile("components/payment-proof-upload.tsx", "utf8"),
    readFile("components/complaint-intake-form.tsx", "utf8"),
    readFile("components/organization-image-upload.tsx", "utf8"),
    readFile("components/gcash-qr-upload.tsx", "utf8"),
    readFile("components/event-image-input.tsx", "utf8"),
    readFile("components/announcement-admin-form.tsx", "utf8"),
    readFile("app/platform/tenants/[id]/page.tsx", "utf8"),
    readFile("app/admin/document-management/upload/page.tsx", "utf8"),
    readFile("lib/system-settings.ts", "utf8"),
    readFile("app/admin/complaints/settings/page.tsx", "utf8"),
  ]);
  for (const source of pickerSources) {
    assert.doesNotMatch(source, /image\/webp|\.webp/);
    assert.doesNotMatch(source, /application\/msword|application\/vnd\.ms-excel|application\/vnd\.ms-powerpoint/);
  }
  assert.match(pickerSources[7], /PDF, JPG, JPEG, PNG, DOCX, XLSX, and PPTX only/);
});

test("persisted-upload browser fixtures use approved file formats instead of banned convenience files", async () => {
  const dmsBrowser = await readFile("tests/e2e/document-management.mjs", "utf8");
  assert.match(dmsBrowser, /e2e-dms-original\.pdf/);
  assert.match(dmsBrowser, /e2e-dms-replacement\.pdf/);
  assert.match(dmsBrowser, /application\\\/pdf/);
  assert.doesNotMatch(dmsBrowser, /e2e-dms-(?:original|replacement)\.txt/);
  assert.doesNotMatch(dmsBrowser, /text\\\/plain/);
});
