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
      !isDevelopment ? "upgrade-insecure-requests" : "",
    ].filter(Boolean).join("; ");
    const securityHeaders = [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), publickey-credentials-create=(self), publickey-credentials-get=(self)" },
      ...(process.env.APP_URL?.startsWith("https://") ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    const noStoreHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Pragma", value: "no-cache" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/login", headers: noStoreHeaders },
      { source: "/activate", headers: noStoreHeaders },
      { source: "/:tenantSlug/login", headers: noStoreHeaders },
      { source: "/portal/:path*", headers: noStoreHeaders },
      { source: "/admin/:path*", headers: noStoreHeaders },
      { source: "/employee/:path*", headers: noStoreHeaders },
      { source: "/platform/:path*", headers: noStoreHeaders },
    ];
  },
};

export default nextConfig;
