import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HOAHub",
    short_name: "HOAHub",
    description: "Secure multi-tenant HOA management platform",
    start_url: "/portal/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f5fbff",
    theme_color: "#078bc9",
    icons: [
      {
        src: "/Hoahub-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/Hoahub-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
