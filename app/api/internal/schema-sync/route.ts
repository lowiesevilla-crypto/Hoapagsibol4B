import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const prismaCli = `${process.cwd()}/node_modules/prisma/build/index.js`;
    await execFileAsync(process.execPath, [prismaCli, "db", "push", "--accept-data-loss", "--skip-generate"], {
      cwd: process.cwd(),
      env: process.env,
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Production schema synchronization failed.", error);
    const commandError = error as Error & { stderr?: string; stdout?: string };
    return NextResponse.json({
      error: "Schema synchronization failed.",
      detail: commandError.stderr?.slice(-2_000) || commandError.stdout?.slice(-2_000) || commandError.message,
    }, { status: 500 });
  }
}
