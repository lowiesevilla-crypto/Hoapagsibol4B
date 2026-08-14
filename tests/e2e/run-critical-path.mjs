import { spawn } from "node:child_process";

const maxAttempts = 3;
const retryMarker = "Target.setDiscoverTargets";
const targetClosedMarker = "Target closed";

function runCriticalPath() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", "./tests/e2e/safe-browser-context-cleanup.mjs", "tests/e2e/critical-path.mjs"],
      {
        env: process.env,
        stdio: ["inherit", "pipe", "pipe"],
      },
    );

    let output = "";
    const capture = (stream, destination) => {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        output += text;
        destination.write(chunk);
      });
    };

    capture(child.stdout, process.stdout);
    capture(child.stderr, process.stderr);

    child.on("error", (error) => {
      const text = `${error?.stack || error}`;
      output += text;
      process.stderr.write(`${text}\n`);
      resolve({ code: 1, signal: null, output });
    });

    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal, output });
    });
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = await runCriticalPath();
  if (result.code === 0) process.exit(0);

  const transientStartupClosure =
    result.output.includes(retryMarker) && result.output.includes(targetClosedMarker);

  if (!transientStartupClosure || attempt === maxAttempts) {
    if (result.signal) process.stderr.write(`Critical browser suite exited on signal ${result.signal}.\n`);
    process.exit(result.code || 1);
  }

  const delayMs = 1500 * attempt;
  process.stderr.write(
    `Chromium closed while initializing target discovery; retrying critical browser startup (${attempt + 1}/${maxAttempts}) after ${delayMs}ms.\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

process.exit(1);
