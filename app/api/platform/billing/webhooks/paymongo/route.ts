import { NextRequest, NextResponse } from "next/server";
import { processPayMongoWebhook } from "@/lib/services/platform-paymongo";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await processPayMongoWebhook(rawBody, request.headers.get("paymongo-signature"));
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json(result, { status: 200 });
}
