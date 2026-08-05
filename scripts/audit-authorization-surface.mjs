import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["lib/actions", "app/api", "app/admin", "app/platform", "app/portal", "lib/services"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const patterns = [
  ["legacy-require-user", /requireUser\(Role\.[A-Z_]+\)/g],
  ["role-comparison", /\b(?:user|admin|actor|session|current|profile\.user)\.role\s*(?:===|!==|==|!=)\s*Role\.[A-Z_]+/g],
  ["role-membership", /\b(?:roles|allowedRoles|adminRoles|platformRoles|homeownerActivationAdminRoles)\.(?:includes|has)\(Role\.[A-Z_]+\)/g],
  ["legacy-role-helper", /\b(?:canUseRole|canUseAssignedRole|requireDocumentTemplateAdmin|requirePlatformAdmin)\b/g],
  ["role-switch", /\b(?:switch|case)\s*\(?\s*(?:user|admin|actor|session)?\.?role\b/g],
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (extensions.has(path.extname(entry.name))) files.push(full.replaceAll("\\", "/"));
  }
  return files;
}

function functionAt(lines, index) {
  for (let cursor = index; cursor >= 0; cursor--) {
    const match = lines[cursor].match(/(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/)
      ?? lines[cursor].match(/export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/);
    if (match) return match[1];
  }
  return "module";
}

const findings = [];
for (const root of roots) {
  for (const file of await walk(root)) {
    const source = await readFile(file, "utf8");
    const lines = source.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      for (const [kind, pattern] of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line))) {
          findings.push({
            kind,
            file,
            line: lineIndex + 1,
            fn: functionAt(lines, lineIndex),
            text: line.trim().replaceAll("|", "\\|"),
          });
        }
      }
    }
  }
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
const counts = new Map();
for (const finding of findings) counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + 1);

console.log("AUTHORIZATION_AUDIT_BEGIN");
console.log("# Authorization Surface Audit");
console.log("");
console.log(`Total findings: ${findings.length}`);
console.log("");
console.log("## Counts");
for (const [kind, count] of [...counts.entries()].sort()) console.log(`- ${kind}: ${count}`);
console.log("");
console.log("## Findings");
console.log("| Kind | File | Line | Function | Context |");
console.log("|---|---|---:|---|---|");
for (const item of findings) console.log(`| ${item.kind} | \`${item.file}\` | ${item.line} | \`${item.fn}\` | \`${item.text}\` |`);
console.log("AUTHORIZATION_AUDIT_END");
