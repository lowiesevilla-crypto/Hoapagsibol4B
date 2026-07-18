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
  | "documents"
  | "plans"
  | "platform"
  | "subscriptions";

export type LinkItem = { href: string; label: string; icon: IconName; section: string };

export const adminLinks: LinkItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard", section: "Administration" },
  { href: "/admin/homeowners", label: "Homeowners", icon: "homeowners", section: "Administration" },
  { href: "/admin/contractors", label: "Contractors", icon: "contractors", section: "Security" },
  { href: "/admin/vehicles", label: "Vehicles & stickers", icon: "vehicles", section: "Security" },
  { href: "/admin/billing", label: "Billing", icon: "billing", section: "Finance" },
  { href: "/admin/settings/billing-rules", label: "Billing rules", icon: "billing", section: "Finance" },
  { href: "/admin/settings/billing-exemptions", label: "Billing exemptions", icon: "billing", section: "Finance" },
  { href: "/admin/receipts", label: "Receipt register", icon: "collections", section: "Finance" },
  { href: "/admin/collections", label: "Other collections", icon: "collections", section: "Finance" },
  { href: "/admin/expenses", label: "Expenses", icon: "expenses", section: "Finance" },
  { href: "/admin/payments/record", label: "Record payment", icon: "payments", section: "Payments" },
  { href: "/admin/payments/requests", label: "Payment requests", icon: "payments", section: "Payments" },
  { href: "/admin/payments/active", label: "Active payments", icon: "payments", section: "Payments" },
  { href: "/admin/payments/history", label: "Transaction history", icon: "payments", section: "Payments" },
  { href: "/admin/reports/dashboard", label: "Finance Dashboard", icon: "dashboard", section: "Reports" },
  { href: "/admin/documents", label: "Document management", icon: "documents", section: "Resident Services" },
  { href: "/admin/announcements", label: "Announcements", icon: "announcements", section: "Resident Services" },
  { href: "/admin/events", label: "Events", icon: "events", section: "Resident Services" },
  { href: "/admin/chat", label: "Chat", icon: "chat", section: "Resident Services" },
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
  { href: "/platform/tenants", label: "Tenants", icon: "platform", section: "Platform" },
  { href: "/platform/plans", label: "Plans", icon: "plans", section: "Platform" },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: "subscriptions", section: "Platform" },
  { href: "/platform/licenses", label: "Licenses", icon: "licenses", section: "Platform" },
  { href: "/platform/audit", label: "Platform audit", icon: "audit", section: "Platform" },
];

export const portalLinks: LinkItem[] = [
  { href: "/portal/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview" }, { href: "/portal/profile", label: "My profile", icon: "profile", section: "Account" },
  { href: "/portal/billing", label: "My billing", icon: "billing", section: "Account" }, { href: "/portal/pay", label: "Pay by QR", icon: "payments", section: "Account" }, { href: "/portal/soa", label: "Statement of Account", icon: "reports", section: "Account" }, { href: "/portal/payments", label: "My payments", icon: "payments", section: "Account" }, { href: "/portal/collections", label: "Collections & bonds", icon: "collections", section: "Account" }, { href: "/portal/vehicles", label: "My vehicles", icon: "vehicles", section: "Account" }, { href: "/portal/documents", label: "Document requests", icon: "documents", section: "Account" },
  { href: "/portal/announcements", label: "Announcements", icon: "announcements", section: "Community" }, { href: "/portal/events", label: "Events", icon: "events", section: "Community" }, { href: "/portal/chat", label: "Chat", icon: "chat", section: "Community" },
  { href: "/portal/organization", label: "HOA officers", icon: "homeowners", section: "Community" },
];

export const employeeLinks: LinkItem[] = [
  { href: "/employee/attendance", label: "Clock in / out", icon: "attendance", section: "Employee" },
  { href: "/employee/attendance/correction", label: "Attendance correction", icon: "attendance", section: "Employee" },
  { href: "/employee/attendance/history", label: "Attendance history", icon: "attendance", section: "Employee" },
  { href: "/employee/payslips", label: "My payslips", icon: "payroll", section: "Employee" },
  { href: "/employee/chat", label: "Chat", icon: "chat", section: "Support" },
];
