import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { verifyHomeownerEmailVerificationToken } from "@/lib/services/homeowner-activation";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const result = await verifyHomeownerEmailVerificationToken(token);
  const url = new URL("/activate", getAppUrl());
  if ("error" in result && result.error) {
    url.searchParams.set("error", result.error);
  } else {
    url.searchParams.set("verified", "email");
  }
  return NextResponse.redirect(url);
}
