import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", app: "HOAHub", database: "mysql", timestamp: new Date().toISOString() });
  } catch {
    console.error("Health check failed.");
    return NextResponse.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}
