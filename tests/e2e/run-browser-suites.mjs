import { spawn } from "node:child_process";

const cleanupImport = "./tests/e2e/safe-browser-context-cleanup.mjs";
const defaultTimeoutMs = 8 * 60_000;
const extendedTimeoutMs = 10 * 60_000;

const suites = [
  {
    label: "critical path",
    args: ["tests/e2e/run-critical-path.mjs"],
    timeoutMs: defaultTimeoutMs,
  },
  {
    label: "onboarding workflow",
    args: ["--import", cleanupImport, "tests/e2e/onboarding-workflow.mjs"],
    timeoutMs: defaultTimeoutMs,
  },
  {
    label: "document workflow",
    args: ["--import", cleanupImport, "tests/e2e/document-workflow.mjs"],
    timeoutMs: extendedTimeoutMs,
  },
  {
    label: "document management",
    args: ["--import", cleanupImport, "tests/e2e/document-management.mjs"],
    timeoutMs: defaultTimeoutMs,
  },
  {
    label: "RBAC stale session",
    args: ["--import", cleanupImport, "tests/e2e/rbac-stale-session.mjs"],
    timeoutMs: defaultTimeoutMs,
  },
  {
    label: "AI assistant",
    args: ["--import", cleanupImport, "tests/e2e/ai-assistant.mjs"],
    timeoutMs: defaultTimeoutMs,
  },
  {
    label: "auth navigation recovery",
    args: ["--import", cleanupImport, "tests/e2e/auth-navigation-recovery.mjs"],
    timeoutMs: extendedTimeoutMs,
  },
];

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function killProcessTree(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try { child.kill(signal); } catch { /* process already exited */ }
  }
}

function runSuite(suite, index) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const position = `${index + 1}/${suites.length}`;
    process.stdout.write(`\n[E2E ${position}] START ${suite.label} (limit ${formatDuration(suite.timeoutMs)})\n`);

    const child = spawn(process.execPath, suite.args, {
      env: process.env,
      stdio: "inherit",
      detached: process.platform !== "win32",
    });

    let settled = false;
    let timedOut = false;
    let hardKillTimer = null;

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      process.stderr.write(`\n[E2E ${position}] TIMEOUT ${suite.label} after ${formatDuration(suite.timeoutMs)}; terminating browser process tree.\n`);
      killProcessTree(child, "SIGTERM");
      hardKillTimer = setTimeout(() => killProcessTree(child, "SIGKILL"), 5_000);
      hardKillTimer.unref?.();
    }, suite.timeoutMs);
    timeoutTimer.unref?.();

    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      const elapsed = Date.now() - startedAt;

      if (error) {
        process.stderr.write(`[E2E ${position}] FAIL ${suite.label} (${formatDuration(elapsed)}): ${error.stack || error}\n`);
        resolve(1);
        return;
      }
      if (timedOut) {
        process.stderr.write(`[E2E ${position}] FAIL ${suite.label}: exceeded ${formatDuration(suite.timeoutMs)}.\n`);
        resolve(124);
        return;
      }
      if ((code ?? 1) !== 0) {
        process.stderr.write(`[E2E ${position}] FAIL ${suite.label} (${formatDuration(elapsed)}), exit=${code ?? "null"}${signal ? ` signal=${signal}` : ""}.\n`);
        resolve(code || 1);
        return;
      }

      process.stdout.write(`[E2E ${position}] PASS ${suite.label} (${formatDuration(elapsed)})\n`);
      resolve(0);
    };

    child.once("error", (error) => finish(1, null, error));
    child.once("exit", (code, signal) => finish(code, signal, null));
  });
}

for (let index = 0; index < suites.length; index += 1) {
  const code = await runSuite(suites[index], index);
  if (code !== 0) process.exit(code);
}

process.stdout.write(`\n[E2E] PASS all ${suites.length} browser suites.\n`);
