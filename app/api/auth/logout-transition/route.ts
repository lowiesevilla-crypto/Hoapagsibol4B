import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { allowedOrigins } from "@/lib/app-url";
import { privateNoStoreHeaders } from "@/lib/anonymous-request-security";

export const dynamic = "force-dynamic";

function trustedConfiguredSource(value: string | null) {
  if (!value || value === "null") return false;
  try {
    return allowedOrigins().has(new URL(value).origin);
  } catch {
    return false;
  }
}

function isTrustedSameOriginNavigation(request: Request) {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin === new URL(request.url).origin) return true;
    } catch {
      // Fall through to configured-origin and browser Fetch Metadata checks.
    }
    if (trustedConfiguredSource(referer)) return true;
  }

  return (
    request.headers.get("sec-fetch-site") === "same-origin" &&
    request.headers.get("sec-fetch-mode") === "navigate" &&
    request.headers.get("sec-fetch-dest") === "document"
  );
}

function escapeHtmlAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function GET(request: Request) {
  if (!isTrustedSameOriginNavigation(request)) {
    return new NextResponse("Forbidden", { status: 403, headers: privateNoStoreHeaders });
  }

  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "current";
  const safeScope = escapeHtmlAttribute(scope);
  const nonce = randomBytes(16).toString("hex");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Signing out | HOAHub</title>
</head>
<body>
  <main>
    <p>Signing out securely…</p>
    <form data-hoahub-logout-transition="true" action="/api/auth/logout" method="post" enctype="application/x-www-form-urlencoded">
      <input type="hidden" name="scope" value="${safeScope}">
      <button type="submit">Continue sign out</button>
    </form>
  </main>
  <script nonce="${nonce}">
    (() => {
      let attempts = 0;
      const submitLogout = () => {
        if (attempts >= 2) return;
        const form = document.querySelector('form[data-hoahub-logout-transition="true"]');
        if (!(form instanceof HTMLFormElement)) {
          document.documentElement.dataset.hoahubLogoutTransition = "form-missing";
          return;
        }
        attempts += 1;
        document.documentElement.dataset.hoahubLogoutTransition = `submitting-${attempts}`;
        HTMLFormElement.prototype.submit.call(form);
      };

      // Do not initiate the first POST until Chromium has committed the transition
      // document. The logout mutation remains outside the protected React tree.
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", submitLogout, { once: true });
      } else {
        submitLogout();
      }

      // Chromium can suppress a navigation requested during the first document-
      // commit task. Permit exactly one delayed retry of the same authoritative POST.
      // A successful first POST unloads this document before the timer can run.
      window.setTimeout(submitLogout, 500);
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      ...privateNoStoreHeaders,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}
