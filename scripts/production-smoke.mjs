const requestedUrl = process.argv.slice(2).find((value) => value !== "--") || process.env.APP_URL || "http://127.0.0.1:3000";
const baseUrl = new URL(requestedUrl).origin;
const checks = [];

function check(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

const health = await fetch(`${baseUrl}/api/health`, { redirect: "manual" });
const healthJson = await health.json().catch(() => null);
check(health.status === 200 && healthJson?.status === "ok" && healthJson?.database === "mysql", "MySQL health endpoint is ready");
check(health.headers.get("x-content-type-options") === "nosniff", "security headers are enabled");

const login = await fetch(`${baseUrl}/login`, { redirect: "manual" });
const loginHtml = await login.text();
check(login.status === 200 && loginHtml.includes("Welcome to your HOA portal"), "login page renders");
check(Boolean(login.headers.get("content-security-policy")), "Content Security Policy is present");

for (const [path, label] of [
  ["/admin/dashboard", "admin dashboard"],
  ["/admin/billing", "billing"],
  ["/admin/payments", "payments"],
  ["/admin/receipts", "receipts"],
  ["/admin/announcements", "announcements"],
  ["/admin/vehicles", "vehicle and sticker records"],
  ["/portal/documents", "resident document requests"],
]) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  check([302, 303, 307, 308].includes(response.status) && (response.headers.get("location") || "").includes("/login"), `${label} requires authentication`);
}

const cron = await fetch(`${baseUrl}/api/cron/daily`, { method: "POST", redirect: "manual" });
check(cron.status === 401, "scheduled maintenance rejects missing credentials");
console.log(`PASS ${checks.length} production smoke checks for ${baseUrl}`);
for (const label of checks) console.log(`- ${label}`);
