export type IconName =
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
  | "chat"
  | "documents";

export type LinkItem = { href: string; label: string; icon: IconName; section: string };

export const adminLinks: LinkItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview" },
  { href: "/admin/homeowners", label: "Homeowners", icon: "homeowners", section: "Residents" }, { href: "/admin/contractors", label: "Contractors", icon: "contractors", section: "Residents" }, { href: "/admin/vehicles", label: "Vehicles & stickers", icon: "vehicles", section: "Residents" },
  { href: "/admin/employees", label: "Employees", icon: "employees", section: "Human resources" }, { href: "/admin/attendance", label: "Attendance", icon: "attendance", section: "Human resources" }, { href: "/admin/payroll", label: "Payroll", icon: "payroll", section: "Human resources" },
  { href: "/admin/billing", label: "Billing", icon: "billing", section: "Finance" }, { href: "/admin/payments", label: "Payments", icon: "payments", section: "Finance" }, { href: "/admin/receipts", label: "Receipt register", icon: "collections", section: "Finance" }, { href: "/admin/collections", label: "Other collections", icon: "collections", section: "Finance" }, { href: "/admin/expenses", label: "Expenses", icon: "expenses", section: "Finance" }, { href: "/admin/reports", label: "Reports", icon: "reports", section: "Finance" }, { href: "/admin/data", label: "Data management", icon: "data", section: "Finance" }, { href: "/admin/data/migrations", label: "Balance migration", icon: "data", section: "Finance" },
  { href: "/admin/documents/new", label: "Generate document", icon: "documents", section: "Document management" }, { href: "/admin/documents", label: "Document requests", icon: "documents", section: "Document management" }, { href: "/admin/documents/generated", label: "Generated documents", icon: "documents", section: "Document management" }, { href: "/admin/document-templates", label: "Document templates", icon: "documents", section: "Document management" }, { href: "/admin/documents/archive", label: "Document archive", icon: "documents", section: "Document management" },
  { href: "/admin/announcements", label: "Announcements", icon: "announcements", section: "Community" }, { href: "/admin/events", label: "Events", icon: "events", section: "Community" }, { href: "/admin/chat", label: "Chat", icon: "chat", section: "Community" },
];

export const systemAdminLinks: LinkItem[] = [
  { href: "/admin/settings", label: "System settings", icon: "settings", section: "System" },
  { href: "/admin/settings/organization", label: "Organization", icon: "homeowners", section: "System" },
  ...adminLinks,
];

export const portalLinks: LinkItem[] = [
  { href: "/portal/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview" }, { href: "/portal/profile", label: "My profile", icon: "profile", section: "Account" },
  { href: "/portal/billing", label: "My billing", icon: "billing", section: "Account" }, { href: "/portal/pay", label: "Pay by QR", icon: "payments", section: "Account" }, { href: "/portal/payments", label: "My payments", icon: "payments", section: "Account" }, { href: "/portal/collections", label: "Collections & bonds", icon: "collections", section: "Account" }, { href: "/portal/vehicles", label: "My vehicles", icon: "vehicles", section: "Account" }, { href: "/portal/documents", label: "Document requests", icon: "documents", section: "Account" },
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
