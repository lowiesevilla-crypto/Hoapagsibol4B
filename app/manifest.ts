import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HOAHub",
    short_name: "HOAHub",
    description: "Secure homeowner portal for HOA balances, payments, requests, and community updates.",
    id: "/",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5fbff",
    theme_color: "#078bc9",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icons/hoahub-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/hoahub-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/hoahub-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
