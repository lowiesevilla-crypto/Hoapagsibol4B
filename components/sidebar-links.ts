import { homeownerSidebarLinks } from "@/lib/homeowner-navigation";

export type IconName =
  | "actions"
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
  { href: "/admin/actions", label: "Action Center", icon: "actions", section: "Administration" },
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
  { href: "/admin/rentals", label: "Rentals", icon: "collections", section: "Finance" },
  { href: "/admin/expenses", label: "Expenses", icon: "expenses", section: "Finance" },
  { href: "/admin/petty-cash", label: "Petty Cash Vouchers", icon: "expenses", section: "Finance" },
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
  { href: "/admin/document-management", label: "Document Management", icon: "documents", section: "Resident Services" },
  { href: "/admin/document-management/categories", label: "Document Categories", icon: "documents", section: "Resident Services" },
  { href: "/admin/ai-copilot", label: "AI Staff Copilot", icon: "chat", section: "AI & Knowledge" },
  { href: "/admin/ai-assistance", label: "AI Assistance", icon: "chat", section: "AI & Knowledge" },
  { href: "/admin/complaints", label: "Complaints", icon: "complaints", section: "Resident Services" },
  { href: "/admin/complaints/settings", label: "Complaint Settings", icon: "complaints", section: "Resident Services" },
  { href: "/admin/complaints/reports", label: "Complaint Reports", icon: "reports", section: "Resident Services" },
  { href: "/admin/announcements", label: "Announcements", icon: "announcements", section: "Community" },
  { href: "/admin/events", label: "Events", icon: "events", section: "Community" },
  { href: "/admin/chat", label: "Chat", icon: "chat", section: "Community" },
  { href: "/admin/workforce", label: "Workforce Hub", icon: "employees", section: "HR & Payroll" },
  { href: "/admin/employees", label: "Employees", icon: "employees", section: "HR & Payroll" },
  { href: "/admin/attendance", label: "Attendance", icon: "attendance", section: "HR & Payroll" },
  { href: "/admin/leave", label: "Leave management", icon: "attendance", section: "HR & Payroll" },
  { href: "/admin/payroll", label: "Payroll", icon: "payroll", section: "HR & Payroll" },
  { href: "/admin/reports", label: "Reports", icon: "reports", section: "Reports" },
  { href: "/admin/data", label: "Data management", icon: "data", section: "Reports" },
  { href: "/admin/data/migrations", label: "Balance migration", icon: "data", section: "Reports" },
];

export const adminShellLinks: LinkItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview" },
  { href: "/admin/actions", label: "Action Center", icon: "actions", section: "Overview" },
  { href: "/admin/homeowners", label: "Homeowners", icon: "homeowners", section: "Residents" },
  { href: "/admin/contractors", label: "Contractors", icon: "contractors", section: "Residents" },
  { href: "/admin/vehicles", label: "Vehicles", icon: "vehicles", section: "Residents" },
  { href: "/admin/billing", label: "Billing", icon: "billing", section: "Finance" },
  { href: "/admin/settings/payments", label: "Payment setup", icon: "settings", section: "Finance" },
  { href: "/admin/payments/requests", label: "Payments", icon: "payments", section: "Finance" },
  { href: "/admin/collections", label: "Collections", icon: "collections", section: "Finance" },
  { href: "/admin/rentals", label: "Rentals", icon: "collections", section: "Finance" },
  { href: "/admin/expenses", label: "Expenses", icon: "expenses", section: "Finance" },
  { href: "/admin/petty-cash", label: "Petty Cash", icon: "expenses", section: "Finance" },
  { href: "/admin/documents", label: "Documents", icon: "documents", section: "Resident Services" },
  { href: "/admin/document-management", label: "Document Repository", icon: "documents", section: "Resident Services" },
  { href: "/admin/complaints", label: "Complaints", icon: "complaints", section: "Resident Services" },
  { href: "/admin/announcements", label: "Announcements", icon: "announcements", section: "Community" },
  { href: "/admin/events", label: "Events", icon: "events", section: "Community" },
  { href: "/admin/chat", label: "Chat", icon: "chat", section: "Community" },
  { href: "/admin/workforce", label: "Workforce Hub", icon: "employees", section: "Workforce" },
  { href: "/admin/employees", label: "Employees", icon: "employees", section: "Workforce" },
  { href: "/admin/attendance", label: "Attendance", icon: "attendance", section: "Workforce" },
  { href: "/admin/leave", label: "Leave", icon: "attendance", section: "Workforce" },
  { href: "/admin/payroll", label: "Payroll", icon: "payroll", section: "Workforce" },
  { href: "/admin/reports", label: "Reports", icon: "reports", section: "Insights & Data" },
  { href: "/admin/data", label: "Data & Imports", icon: "data", section: "Insights & Data" },
  { href: "/admin/ai-copilot", label: "AI Staff Copilot", icon: "chat", section: "AI & Knowledge" },
  { href: "/admin/profile", label: "My Profile", icon: "profile", section: "Account" },
  { href: "/admin/subscription", label: "HOAHub Subscription", icon: "subscriptions", section: "Account" },
  { href: "/admin/agreement", label: "HOAHub Agreement", icon: "documents", section: "Account" },
];

export const systemAdminLinks: LinkItem[] = [
  { href: "/admin/settings", label: "System settings", icon: "settings", section: "Settings" },
  { href: "/admin/settings/organization", label: "Organization", icon: "homeowners", section: "Settings" },
  ...adminLinks,
];

export const systemAdminShellLinks: LinkItem[] = [...adminShellLinks, { href: "/admin/settings", label: "Settings", icon: "settings", section: "Account" }];

export const platformLinks: LinkItem[] = [
  { href: "/platform/dashboard", label: "Dashboard", icon: "dashboard", section: "Platform Home" },
  { href: "/platform/tenants", label: "Tenants", icon: "platform", section: "Customers" },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: "subscriptions", section: "Commercial" },
  { href: "/platform/plans", label: "Plans & Features", icon: "plans", section: "Commercial" },
  { href: "/platform/invoices", label: "Invoices", icon: "billing", section: "Commercial" },
  { href: "/platform/agreements", label: "Agreements", icon: "documents", section: "Commercial" },
  { href: "/platform/licenses", label: "Licenses", icon: "licenses", section: "Operations" },
  { href: "/platform/document-management", label: "Document Usage", icon: "documents", section: "Operations" },
  { href: "/platform/ai-usage", label: "AI Usage", icon: "chat", section: "Operations" },
  { href: "/platform/audit", label: "Audit & Security", icon: "audit", section: "Governance" },
  { href: "/platform/profile", label: "My Profile", icon: "profile", section: "Account" },
];

export const portalLinks: LinkItem[] = homeownerSidebarLinks;

export const employeeLinks: LinkItem[] = [
  { href: "/employee/profile", label: "My Profile", icon: "profile", section: "Account" },
  { href: "/employee/attendance", label: "Time", icon: "attendance", section: "Employee" },
  { href: "/employee/attendance/history", label: "My timelogs", icon: "attendance", section: "Employee" },
  { href: "/employee/attendance/correction", label: "Attendance correction", icon: "attendance", section: "Employee" },
  { href: "/employee/requests/overtime", label: "Overtime requests", icon: "attendance", section: "Employee" },
  { href: "/employee/leave", label: "Leave requests", icon: "attendance", section: "Employee" },
  { href: "/employee/payslips", label: "My payslips", icon: "payroll", section: "Employee" },
  { href: "/employee/loans", label: "Loans & cash advances", icon: "payroll", section: "Employee" },
  { href: "/employee/chat", label: "Chat", icon: "chat", section: "Support" },
];
