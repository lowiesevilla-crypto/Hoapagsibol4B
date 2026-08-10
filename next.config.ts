import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    const isDevelopment = process.env.NODE_ENV !== "production";
    const isHttpsDeployment = process.env.APP_URL?.startsWith("https://") === true;
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self'${isDevelopment ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`,
      "frame-src 'self'",
      !isDevelopment && isHttpsDeployment ? "upgrade-insecure-requests" : "",
    ].filter(Boolean).join("; ");
    const securityHeaders = [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), publickey-credentials-create=(self), publickey-credentials-get=(self)" },
      ...(isHttpsDeployment ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    const noStoreHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Pragma", value: "no-cache" },
    ];
    const revalidateHeaders = [
      { key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" },
      { key: "Pragma", value: "no-cache" },
    ];
    const serviceWorkerHeaders = [
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Pragma", value: "no-cache" },
      { key: "Service-Worker-Allowed", value: "/" },
    ];
    const iconHeaders = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/", headers: noStoreHeaders },
      { source: "/login", headers: noStoreHeaders },
      { source: "/app", headers: noStoreHeaders },
      { source: "/activate", headers: noStoreHeaders },
      { source: "/activate/verify", headers: noStoreHeaders },
      { source: "/:tenantSlug/login", headers: noStoreHeaders },
      { source: "/api/auth/:path*", headers: noStoreHeaders },
      { source: "/api/complaints/:path*", headers: noStoreHeaders },
      { source: "/complaints/:path*", headers: noStoreHeaders },
      { source: "/portal/:path*", headers: noStoreHeaders },
      { source: "/admin/:path*", headers: noStoreHeaders },
      { source: "/employee/:path*", headers: noStoreHeaders },
      { source: "/platform/:path*", headers: noStoreHeaders },
      { source: "/manifest.webmanifest", headers: revalidateHeaders },
      { source: "/sw.js", headers: serviceWorkerHeaders },
      { source: "/service-worker.js", headers: revalidateHeaders },
      { source: "/icons/:path*", headers: iconHeaders },
      { source: "/apple-touch-icon.png", headers: iconHeaders },
      { source: "/favicon.ico", headers: iconHeaders },
    ];
  },
};

export default nextConfig;
