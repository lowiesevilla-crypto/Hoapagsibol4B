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
<body data-hoahub-logout-scope="${safeScope}">
  <main>
    <p data-hoahub-logout-status="true">Signing out securely…</p>
    <button type="button" data-hoahub-logout-retry="true" hidden>Try sign out again</button>
  </main>
  <script nonce="${nonce}">
    (() => {
      const status = document.querySelector('[data-hoahub-logout-status="true"]');
      const retryButton = document.querySelector('[data-hoahub-logout-retry="true"]');
      let inFlight = false;

      const safeLoginDestination = (destination) => destination.origin === window.location.origin
        && (destination.pathname === "/login" || destination.pathname.endsWith("/login"));

      const fail = (reason) => {
        inFlight = false;
        document.documentElement.dataset.hoahubLogoutTransition = "failed";
        document.documentElement.dataset.hoahubLogoutError = reason;
        if (status) status.textContent = "We could not complete sign out. Try again.";
        if (retryButton instanceof HTMLButtonElement) retryButton.hidden = false;
      };

      const submitLogout = async () => {
        if (inFlight) return;
        inFlight = true;
        if (retryButton instanceof HTMLButtonElement) retryButton.hidden = true;
        delete document.documentElement.dataset.hoahubLogoutError;
        document.documentElement.dataset.hoahubLogoutTransition = "revoking";

        const scope = document.body.dataset.hoahubLogoutScope === "all" ? "all" : "current";
        try {
          // The transition uses a fresh same-origin PUT with no request body. This avoids
          // Next.js Server Action POST dispatch and DELETE-body transport edge cases while
          // keeping session revocation entirely under the authoritative logout Route Handler.
          const response = await fetch("/api/auth/logout?scope=" + encodeURIComponent(scope), {
            method: "PUT",
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            headers: { "X-HOAHub-Logout-Transition": "1" },
          });

          if (response.status !== 204) {
            fail("status");
            return;
          }

          const rawDestination = response.headers.get("X-HOAHub-Logout-Destination");
          if (!rawDestination) {
            fail("destination-missing");
            return;
          }

          const destination = new URL(rawDestination, window.location.origin);
          if (!safeLoginDestination(destination)) {
            fail("destination-unsafe");
            return;
          }

          document.documentElement.dataset.hoahubLogoutTransition = "navigating";
          window.location.replace(destination.href);
        } catch {
          fail("network");
        }
      };

      if (retryButton instanceof HTMLButtonElement) retryButton.addEventListener("click", () => void submitLogout());
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => void submitLogout(), { once: true });
      } else {
        void submitLogout();
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      ...privateNoStoreHeaders,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`,
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}
