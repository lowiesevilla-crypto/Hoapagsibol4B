export const SAFE_CHUNK_RECOVERY_MESSAGE = "The app was updated while this page was open. Refresh once to load the latest version.";

const CHUNK_FAILURE_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /\/_next\/static\/chunks\//i,
  /\/_next\/static\/css\//i,
];

export function isChunkLoadFailure(error: unknown) {
  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "object" && error
        ? String((error as { message?: unknown; reason?: unknown }).message || (error as { reason?: unknown }).reason || "")
        : "";
  return CHUNK_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export function chunkRecoveryKey(pathname: string, buildId = "unknown") {
  return `hoahub.chunk-recovery.${buildId}.${routeCategory(pathname)}`;
}

export function routeCategory(pathname: string) {
  if (pathname === "/login" || pathname === "/forgot-password" || pathname.startsWith("/activate")) return "auth";
  if (/^\/[^/]+\/login$/.test(pathname)) return "tenant-login";
  if (pathname.startsWith("/portal")) return "portal";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/platform")) return "platform";
  if (pathname.startsWith("/employee")) return "employee";
  return "public";
}
