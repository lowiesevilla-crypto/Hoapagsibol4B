import { homeownerSidebarLinks } from "@/lib/homeowner-navigation";

export type IconName =
  | "audit"
  | "dashboard"
  | "homeowners"
  | "contractors"
  | "vehicles"
  | "employees"
  | "attendance"
  | "payroll"
  | "expenses"
  | "billing"
  | "payments"
  | "collections"
  | "announcements"
  | "events"
  | "reports"
  | "data"
  | "settings"
  | "profile"
  | "licenses"
  | "chat"
  | "complaints"
  | "documents"
  | "plans"
  | "platform"
  | "subscriptions";

export type LinkItem = { href: string; label: string; icon: IconName; section: string };

export const adminLinks: LinkItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard", section: "Administration" },
  { href: "/admin/profile", label: "My Profile", icon: "profile", section: "Account" },
  { href: "/admin/subscription", label: "HOAHub Subscription", icon: "subscriptions", section: "Account" },
  { href: "/admin/agreement", label: "HOAHub Agreement", icon: "documents", section: "Account" },
  { href: "/admin/onboarding", label: "Tenant onboarding", icon: "settings", section: "Administration" },
  { href: "/admin/homeowners", label: "Homeowners", icon: "homeowners", section: "Administration" },
  { href: "/admin/contractors", label: "Contractors", icon: "contractors", section: "Security" },
  { href: "/admin/vehicles", label: "Vehicles & stickers", icon: "vehicles", section: "Security" },
  { href: "/admin/billing", label: "Billing", icon: "billing", section: "Finance" },
  { href: "/admin/settings/billing-rules", label: "Billing rules", icon: "billing", section: "Finance" },
  { href: "/admin/settings/billing-exemptions", label: "Billing exemptions", icon: "billing", section: "Finance" },
  { href: "/admin/receipts", label: "Receipt register", icon: "collections", section: "Finance" },
  { href: "/admin/collections", label: "Other collections", icon: "collections", section: "Finance" },
  { href: "/admin/expenses", label: "Expenses", icon: "expenses", section: "Finance" },
  { href: "/admin/settings/payments", label: "Homeowner payment setup", icon: "settings", section: "Payments" },
  { href: "/admin/payments/record", label: "Record payment", icon: "payments", section: "Payments" },
  { href: "/admin/payments/requests", label: "Payment requests", icon: "payments", section: "Payments" },
  { href: "/admin/payments/active", label: "Active payments", icon: "payments", section: "Payments" },
  { href: "/admin/payments/history", label: "Transaction history", icon: "payments", section: "Payments" },
  { href: "/admin/reports/dashboard", label: "Finance Dashboard", icon: "dashboard", section: "Reports" },
  { href: "/admin/documents?section=types", label: "Document Definitions", icon: "documents", section: "Resident Services" },
  { href: "/admin/documents?section=templates", label: "Templates", icon: "documents", section: "Resident Services" },
  { href: "/admin/documents?section=requests", label: "Requests", icon: "documents", section: "Resident Services" },
  { href: "/admin/documents/new", label: "Create Walk-In / Office Request", icon: "documents", section: "Resident Services" },
  { href: "/admin/documents?section=issued", label: "Issued Documents", icon: "documents", section: "Resident Services" },
  { href: "/admin/complaints", label: "Complaints", icon: "complaints", section: "Resident Services" },
  { href: "/admin/complaints/settings", label: "Complaint Settings", icon: "complaints", section: "Resident Services" },
  { href: "/admin/complaints/reports", label: "Complaint Reports", icon: "reports", section: "Resident Services" },
  { href: "/admin/announcements", label: "Announcements", icon: "announcements", section: "Community" },
  { href: "/admin/events", label: "Events", icon: "events", section: "Community" },
  { href: "/admin/chat", label: "Chat", icon: "chat", section: "Community" },
  { href: "/admin/employees", label: "Employees", icon: "employees", section: "HR & Payroll" },
  { href: "/admin/attendance", label: "Attendance", icon: "attendance", section: "HR & Payroll" },
  { href: "/admin/payroll", label: "Payroll", icon: "payroll", section: "HR & Payroll" },
  { href: "/admin/reports", label: "Reports", icon: "reports", section: "Reports" },
  { href: "/admin/data", label: "Data management", icon: "data", section: "Reports" },
  { href: "/admin/data/migrations", label: "Balance migration", icon: "data", section: "Reports" },
];

export const systemAdminLinks: LinkItem[] = [
  { href: "/admin/settings", label: "System settings", icon: "settings", section: "Settings" },
  { href: "/admin/settings/organization", label: "Organization", icon: "homeowners", section: "Settings" },
  ...adminLinks,
];

export const platformLinks: LinkItem[] = [
  { href: "/platform/profile", label: "My Profile", icon: "profile", section: "Account" },
  { href: "/platform/tenants", label: "Tenants", icon: "platform", section: "Platform" },
  { href: "/platform/plans", label: "Plans", icon: "plans", section: "Platform" },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: "subscriptions", section: "Platform" },
  { href: "/platform/agreements", label: "Agreements", icon: "documents", section: "Platform" },
  { href: "/platform/invoices", label: "Invoices", icon: "billing", section: "Platform" },
  { href: "/platform/licenses", label: "Licenses", icon: "licenses", section: "Platform" },
  { href: "/platform/audit", label: "Platform audit", icon: "audit", section: "Platform" },
];

export const portalLinks: LinkItem[] = homeownerSidebarLinks;

export const employeeLinks: LinkItem[] = [
  { href: "/employee/profile", label: "My Profile", icon: "profile", section: "Account" },
  { href: "/employee/attendance", label: "Clock in / out", icon: "attendance", section: "Employee" },
  { href: "/employee/attendance/correction", label: "Attendance correction", icon: "attendance", section: "Employee" },
  { href: "/employee/attendance/history", label: "Attendance history", icon: "attendance", section: "Employee" },
  { href: "/employee/payslips", label: "My payslips", icon: "payroll", section: "Employee" },
  { href: "/employee/chat", label: "Chat", icon: "chat", section: "Support" },
];
