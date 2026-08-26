import { appendFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const statusPath = "/tmp/hoahub-ci-suite-status.log";
const outputPath = "/tmp/hoahub-ci-suite-output.log";

const safeCleanupImport = "./tests/e2e/safe-browser-context-cleanup.mjs";

const suites = [
  {
    name: "production-smoke",
    command: "pnpm",
    args: ["smoke:production", "--", baseUrl],
  },
  {
    name: "critical-path",
    command: "node",
    args: ["tests/e2e/run-critical-path.mjs"],
  },
  {
    name: "employee-workflow",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/employee-workflow.mjs"],
  },
  {
    name: "payroll-critical-path",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/payroll-critical-path.mjs"],
  },
  {
    name: "onboarding-workflow",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/onboarding-workflow.mjs"],
  },
  {
    name: "document-workflow",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/document-workflow.mjs"],
  },
  {
    name: "document-management",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/document-management.mjs"],
  },
  {
    name: "rbac-stale-session",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/rbac-stale-session.mjs"],
  },
  {
    name: "ai-assistant",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/ai-assistant.mjs"],
  },
  {
    name: "admin-premium-search",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/admin-premium-search.mjs"],
  },
  {
    name: "homeowner-mobile-route-chrome",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/homeowner-mobile-route-chrome.mjs"],
  },
  {
    name: "auth-navigation-recovery",
    command: "node",
    args: ["--import", safeCleanupImport, "tests/e2e/auth-navigation-recovery.mjs"],
  },
];

writeFileSync(statusPath, "", "utf8");
writeFileSync(outputPath, "", "utf8");

function recordStatus(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  appendFileSync(statusPath, line, "utf8");
  process.stdout.write(`[ci-suite] ${message}\n`);
}

function appendOutput(chunk) {
  appendFileSync(outputPath, chunk);
}

function runSuite(suite) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`::group::HOAHub suite: ${suite.name}\n`);
    appendFileSync(outputPath, `\n===== ${suite.name} =====\n`, "utf8");
    recordStatus(`START ${suite.name}`);

    const child = spawn(suite.command, suite.args, {
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      appendOutput(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      appendOutput(chunk);
    });

    child.once("error", (error) => {
      recordStatus(`FAIL ${suite.name} spawn-error=${error.message}`);
      process.stderr.write(`::error title=HOAHub suite failed::${suite.name} could not start: ${error.message}\n`);
      process.stdout.write("::endgroup::\n");
      reject(error);
    });

    child.once("close", (code, signal) => {
      if (code === 0) {
        recordStatus(`PASS ${suite.name}`);
        process.stdout.write("::endgroup::\n");
        resolve();
        return;
      }

      const detail = signal ? `signal=${signal}` : `exit=${code ?? "unknown"}`;
      recordStatus(`FAIL ${suite.name} ${detail}`);
      process.stderr.write(`::error title=HOAHub suite failed::${suite.name} failed (${detail})\n`);
      process.stdout.write("::endgroup::\n");
      reject(new Error(`${suite.name} failed (${detail})`));
    });
  });
}

try {
  for (const suite of suites) {
    await runSuite(suite);
  }
  recordStatus("ALL_PASS");
} catch (error) {
  process.stderr.write(`[critical-browser-ci] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
