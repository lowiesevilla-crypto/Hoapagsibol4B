import { NextResponse } from "next/server";
import { privateNoStoreHeaders } from "@/lib/anonymous-request-security";

export const dynamic = "force-dynamic";

const script = `(() => {
  const form = document.querySelector('form[data-hoahub-logout-transition="true"]');
  if (form instanceof HTMLFormElement) HTMLFormElement.prototype.submit.call(form);
})();`;

export async function GET() {
  return new NextResponse(script, {
    status: 200,
    headers: {
      ...privateNoStoreHeaders,
      "content-type": "application/javascript; charset=utf-8",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}
