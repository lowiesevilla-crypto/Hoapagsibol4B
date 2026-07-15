import type { Metadata } from "next";
import type { LinkItem } from "@/components/sidebar-links";
import { prisma } from "@/lib/db";

const titleOverrides: Record<string, string> = {
  "/admin/settings": "Configuration Center",
};

export function tenantMetadata(pageTitle: string, tenantName: string): Metadata {
  return {
    title: {
      absolute: `${pageTitle} | ${tenantName}`,
      template: `%s | ${tenantName}`,
    },
  };
}

export async function tenantNameForMetadata(tenantId: string, fallback: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name || fallback;
}

export function routeTitle(pathname: string, links: LinkItem[], fallback: string) {
  const path = normalizePath(pathname);
  if (titleOverrides[path]) return titleOverrides[path];
  const exact = links.find((item) => item.href === path);
  if (exact) return titleCase(exact.label);
  const parent = links
    .filter((item) => path.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];
  return parent ? titleCase(parent.label) : fallback;
}

function normalizePath(pathname: string) {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "");
  return path || "/";
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
