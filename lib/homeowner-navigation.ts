import { TenantModule } from "@prisma/client";
import type { IconName, LinkItem } from "@/components/sidebar-links";

export type HomeownerPrimaryId = "home" | "payments" | "requests" | "community" | "more";

export type HomeownerNavigationLink = LinkItem & {
  description: string;
  module?: TenantModule;
  prefixes?: string[];
};

export type HomeownerPrimaryDestination = {
  id: HomeownerPrimaryId;
  label: string;
  href: string;
  icon: "home" | "payments" | "requests" | "community" | "more";
  prefixes: string[];
  module?: TenantModule;
  childModules?: TenantModule[];
};

export type HomeownerNavigationState = {
  primaryDestinations: HomeownerPrimaryDestination[];
  sidebarLinks: HomeownerNavigationLink[];
  requestLinks: HomeownerNavigationLink[];
  communityLinks: HomeownerNavigationLink[];
  moreLinks: HomeownerNavigationLink[];
  hasChat: boolean;
};

export const homeownerPrimaryDestinations: HomeownerPrimaryDestination[] = [
  {
    id: "home",
    label: "Home",
    href: "/portal/dashboard",
    icon: "home",
    prefixes: ["/portal/dashboard"],
  },
  {
    id: "payments",
    label: "Payments",
    href: "/portal/pay",
    icon: "payments",
    module: TenantModule.BILLING,
    prefixes: ["/portal/pay", "/portal/billing", "/portal/soa", "/portal/payments", "/portal/collections"],
  },
  {
    id: "requests",
    label: "Requests",
    href: "/portal/requests",
    icon: "requests",
    childModules: [TenantModule.DOCUMENTS, TenantModule.COMPLAINTS],
    prefixes: ["/portal/requests", "/portal/documents", "/documents", "/portal/complaints", "/complaints/track"],
  },
  {
    id: "community",
    label: "Community",
    href: "/portal/community",
    icon: "community",
    childModules: [TenantModule.ANNOUNCEMENTS, TenantModule.EVENTS, TenantModule.CHAT],
    prefixes: ["/portal/community", "/portal/announcements", "/portal/events", "/portal/chat", "/portal/organization"],
  },
  {
    id: "more",
    label: "More",
    href: "/portal/more",
    icon: "more",
    prefixes: ["/portal/more", "/portal/profile", "/portal/vehicles"],
  },
];

export const homeownerSidebarLinks: HomeownerNavigationLink[] = [
  { href: "/portal/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview", description: "Homeowner overview" },
  { href: "/portal/pay", label: "Pay by QR", icon: "payments", section: "Payments", module: TenantModule.BILLING, description: "Pay dues and assessments" },
  { href: "/portal/billing", label: "My billing", icon: "billing", section: "Payments", module: TenantModule.BILLING, description: "Review current charges" },
  { href: "/portal/soa", label: "Statement of Account", icon: "reports", section: "Payments", module: TenantModule.BILLING, description: "Download your SOA" },
  { href: "/portal/payments", label: "Payment history", icon: "payments", section: "Payments", module: TenantModule.BILLING, description: "View recorded payments" },
  { href: "/portal/collections", label: "Collections & bonds", icon: "collections", section: "Payments", module: TenantModule.BILLING, description: "Track other collections" },
  { href: "/portal/requests", label: "Requests", icon: "documents", section: "Resident Services", description: "Documents and complaints" },
  { href: "/portal/documents", label: "Document Requests", icon: "documents", section: "Resident Services", module: TenantModule.DOCUMENTS, description: "Request or view documents" },
  { href: "/portal/complaints", label: "My Complaints", icon: "complaints", section: "Resident Services", module: TenantModule.COMPLAINTS, description: "Track submitted concerns" },
  { href: "/portal/complaints/new", label: "Submit Complaint", icon: "complaints", section: "Resident Services", module: TenantModule.COMPLAINTS, description: "Create a new complaint" },
  { href: "/portal/community", label: "Community", icon: "announcements", section: "Community", description: "HOA updates and conversations" },
  { href: "/portal/announcements", label: "Announcements", icon: "announcements", section: "Community", module: TenantModule.ANNOUNCEMENTS, description: "Read HOA announcements" },
  { href: "/portal/events", label: "Events", icon: "events", section: "Community", module: TenantModule.EVENTS, description: "View community events" },
  { href: "/portal/chat", label: "Chat", icon: "chat", section: "Community", module: TenantModule.CHAT, description: "Message the HOA team" },
  { href: "/portal/organization", label: "HOA officers", icon: "homeowners", section: "Community", description: "View association contacts" },
  { href: "/portal/more", label: "More", icon: "profile", section: "Account", description: "Profile, settings, and app actions" },
  { href: "/portal/profile", label: "My profile", icon: "profile", section: "Account", description: "Manage your account details" },
  { href: "/portal/vehicles", label: "My vehicles", icon: "vehicles", section: "Account", module: TenantModule.VEHICLES, description: "Review registered vehicles" },
];

export const homeownerModuleRules: Array<[string, TenantModule]> = homeownerSidebarLinks
  .filter((link): link is HomeownerNavigationLink & { module: TenantModule } => Boolean(link.module))
  .map((link) => [link.href, link.module]);

export function resolveHomeownerNavigation(enabled: ReadonlySet<TenantModule>): HomeownerNavigationState {
  const sidebarLinks = homeownerSidebarLinks.filter((link) => isNavigationLinkEnabled(link, enabled));
  const requestLinks = sidebarLinks.filter((link) => link.section === "Resident Services" && link.href !== "/portal/requests");
  const communityLinks = sidebarLinks.filter((link) => link.section === "Community" && link.href !== "/portal/community");
  const moreLinks = sidebarLinks.filter((link) => link.section === "Account" && link.href !== "/portal/more");
  return {
    primaryDestinations: homeownerPrimaryDestinations.filter((destination) => isPrimaryDestinationEnabled(destination, enabled)),
    sidebarLinks,
    requestLinks,
    communityLinks,
    moreLinks,
    hasChat: sidebarLinks.some((link) => link.href === "/portal/chat"),
  };
}

export function isHomeownerPrimaryActive(destination: HomeownerPrimaryDestination, pathname: string) {
  const path = normalizePortalPath(pathname);
  return destination.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function homeownerRouteTitle(pathname: string) {
  const path = normalizePortalPath(pathname);
  const allItems = [...homeownerPrimaryDestinations, ...homeownerSidebarLinks]
    .sort((left, right) => right.href.length - left.href.length);
  const match = allItems.find((item) => path === item.href || path.startsWith(`${item.href}/`));
  return match ? titleCase(match.label) : "Dashboard";
}

export function moduleForHomeownerLink(href: string) {
  const path = normalizePortalPath(href);
  return homeownerModuleRules.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
}

export function iconForHomeownerLink(link: HomeownerNavigationLink): IconName {
  return link.icon;
}

function isNavigationLinkEnabled(link: HomeownerNavigationLink, enabled: ReadonlySet<TenantModule>) {
  return !link.module || enabled.has(link.module);
}

function isPrimaryDestinationEnabled(destination: HomeownerPrimaryDestination, enabled: ReadonlySet<TenantModule>) {
  if (destination.module) return enabled.has(destination.module);
  if (destination.id === "requests") return destination.childModules?.some((module) => enabled.has(module)) ?? false;
  return true;
}

function normalizePortalPath(pathname: string) {
  const path = pathname.split(/[?#]/)[0]?.replace(/\/+$/, "");
  return path || "/";
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
