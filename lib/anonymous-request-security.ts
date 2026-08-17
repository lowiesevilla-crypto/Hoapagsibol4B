import "server-only";

export const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export function assertSameOrigin(request: Request) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin !== expectedOrigin) throw new Error("Request origin is not allowed.");
    return;
  }

  const referer = request.headers.get("referer");
  if (!referer) throw new Error("Request origin is required.");
  let refererOrigin = "";
  try {
    refererOrigin = new URL(referer).origin;
  } catch {
    throw new Error("Request origin is not allowed.");
  }
  if (refererOrigin !== expectedOrigin) throw new Error("Request origin is not allowed.");
}
