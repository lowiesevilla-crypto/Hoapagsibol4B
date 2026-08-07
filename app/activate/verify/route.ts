import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { verifyHomeownerEmailVerificationToken } from "@/lib/services/homeowner-activation";
import {
  ACTIVATION_HANDOFF_COOKIE,
  ACTIVATION_HANDOFF_MAX_AGE_SECONDS,
  createActivationHandoffFromVerifiedToken,
} from "@/lib/services/homeowner-activation-handoff";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const verification = await verifyHomeownerEmailVerificationToken(token);
  const url = new URL("/activate", getAppUrl());

  if ("error" in verification && verification.error) {
    url.searchParams.set("error", verification.error);
    return NextResponse.redirect(url);
  }

  const handoff = await createActivationHandoffFromVerifiedToken(token);
  if ("error" in handoff) {
    url.searchParams.set("error", handoff.error || "This activation handoff is invalid or has expired.");
    return NextResponse.redirect(url);
  }

  url.searchParams.set("verified", "email");
  const response = NextResponse.redirect(url);
  response.cookies.set(ACTIVATION_HANDOFF_COOKIE, handoff.handoff, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/activate",
    maxAge: ACTIVATION_HANDOFF_MAX_AGE_SECONDS,
  });
  return response;
}
