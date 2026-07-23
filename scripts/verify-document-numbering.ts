import { validateNumberingFormat } from "../lib/services/document-numbering";

const validFormats = [
  "{PREFIX}-{YYYY}-{SEQUENCE:6}",
  "COR-{YYYY}-{SEQUENCE:4}",
  "TESTHOA-COR-{YY}-{MM}-{SEQUENCE:6}",
];

const invalidFormats = [
  "",
  "{PREFIX}-{YYYY}",
  "{PREFIX}-{YYYY}-{SEQUENCE:5}",
  "{TENANT_ID}-{YYYY}-{SEQUENCE:6}",
  "DOC-<script>-{SEQUENCE:6}",
];

let failed = false;

for (const format of validFormats) {
  const result = validateNumberingFormat(format);
  if (!result.valid) {
    failed = true;
    console.error(`Expected valid format to pass: ${format}`, result.errors);
  }
}

for (const format of invalidFormats) {
  const result = validateNumberingFormat(format);
  if (result.valid) {
    failed = true;
    console.error(`Expected invalid format to fail: ${format}`);
  }
}

if (failed) process.exit(1);
console.log(JSON.stringify({ validFormats: validFormats.length, invalidFormats: invalidFormats.length, passed: true }, null, 2));
