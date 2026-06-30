import {
  DocumentType,
  PayrollAccessRole,
  PrismaClient,
  Role,
  SystemSettingCategory,
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function seedBootstrapAdministrator() {
  const email = process.env.SEED_SYSTEM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SYSTEM_ADMIN_PASSWORD;
  if (!email || !password) return null;
  if (password.length < 12) throw new Error("SEED_SYSTEM_ADMIN_PASSWORD must contain at least 12 characters.");

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: Role.SYSTEM_ADMIN },
    create: {
      name: process.env.SEED_SYSTEM_ADMIN_NAME?.trim() || "System Administrator",
      email,
      passwordHash: await hash(password, 12),
      role: Role.SYSTEM_ADMIN,
    },
  });
  await prisma.payrollAccess.upsert({
    where: { userId_role: { userId: user.id, role: PayrollAccessRole.SYSTEM_ADMINISTRATOR } },
    update: { active: true, grantedById: user.id },
    create: { userId: user.id, role: PayrollAccessRole.SYSTEM_ADMINISTRATOR, active: true, grantedById: user.id },
  });
  return user;
}

async function main() {
  const administrator = await seedBootstrapAdministrator();
  const settings = [
    [SystemSettingCategory.ASSOCIATION, "ASSOCIATION_NAME", "Association name", "PAGSIBOL VILLAGE PH2 4B EAST"],
    [SystemSettingCategory.ASSOCIATION, "ASSOCIATION_ADDRESS", "Address", "Pagsibol Village Phase 2 4B East"],
    [SystemSettingCategory.ASSOCIATION, "ASSOCIATION_CONTACT_NUMBER", "Contact number", ""],
    [SystemSettingCategory.ASSOCIATION, "ASSOCIATION_EMAIL", "Email address", ""],
    [SystemSettingCategory.ASSOCIATION, "ASSOCIATION_TIN_NUMBER", "TIN number", ""],
    [SystemSettingCategory.ASSOCIATION, "ASSOCIATION_SEC_REGISTRATION_NUMBER", "SEC registration number", ""],
    [SystemSettingCategory.ASSOCIATION, "ASSOCIATION_LOGO_URL", "Association logo URL", "/pagsibol-logo.png"],
    [SystemSettingCategory.DATABASE, "DATABASE_PROVIDER", "Database provider", "MySQL"],
    [SystemSettingCategory.EMAIL, "MAIL_PROVIDER", "Mail provider", "gmail"],
    [SystemSettingCategory.EMAIL, "MAIL_HOST", "SMTP host", "smtp.gmail.com"],
    [SystemSettingCategory.EMAIL, "MAIL_PORT", "SMTP port", "587"],
    [SystemSettingCategory.EMAIL, "MAIL_ENCRYPTION", "Encryption", "tls"],
    [SystemSettingCategory.EMAIL, "MAIL_FROM_NAME", "Sender name", "HOA Digital Hub"],
    [SystemSettingCategory.EMAIL, "MAIL_FROM_ADDRESS", "Sender email", ""],
    [SystemSettingCategory.EMAIL, "PASSWORD_RESET_EXPIRY_MINUTES", "Reset link expiry (minutes)", "60"],
    [SystemSettingCategory.EMAIL, "PASSWORD_MIN_LENGTH", "Minimum password length", "10"],
    [SystemSettingCategory.EMAIL, "PASSWORD_REQUIRE_UPPERCASE", "Require uppercase", "true"],
    [SystemSettingCategory.EMAIL, "PASSWORD_REQUIRE_LOWERCASE", "Require lowercase", "true"],
    [SystemSettingCategory.EMAIL, "PASSWORD_REQUIRE_NUMBER", "Require number", "true"],
    [SystemSettingCategory.EMAIL, "PASSWORD_REQUIRE_SPECIAL", "Require special character", "true"],
    [SystemSettingCategory.FACEBOOK, "FACEBOOK_GRAPH_API_VERSION", "Graph API version", "v23.0"],
    [SystemSettingCategory.PAYMENT, "GCASH_ACCOUNT_NAME", "GCash account name", "PAGSIBOL VILLAGE PH2 4B EAST HOA"],
    [SystemSettingCategory.PAYMENT, "GCASH_MOBILE_NUMBER", "GCash mobile number", ""],
    [SystemSettingCategory.PAYMENT, "PAYMENT_INSTRUCTIONS", "Payment instructions", "Contact the HOA office for official payment instructions."],
    [SystemSettingCategory.CHAT, "CHAT_MAX_ATTACHMENT_MB", "Maximum attachment size MB", "10"],
    [SystemSettingCategory.CHAT, "CHAT_ALLOWED_MIME_TYPES", "Allowed attachment file types", "image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    [SystemSettingCategory.CHAT, "CHAT_POLL_INTERVAL_SECONDS", "Chat refresh interval seconds", "5"],
  ] as const;
  for (const [category, key, label, value] of settings) {
    await prisma.systemSetting.upsert({
      where: { category_key: { category, key } },
      update: { label, ...(key === "DATABASE_PROVIDER" ? { value: "MySQL" } : {}) },
      create: { category, key, label, value, updatedById: administrator?.id },
    });
  }
  await prisma.systemSetting.updateMany({
    where: { category: SystemSettingCategory.DATABASE, key: "DATABASE_URL" },
    data: { value: null },
  });

  for (const [name, description] of [
    ["Security Services", "Guard services and security support"],
    ["Utilities", "Electricity, water, internet and communications"],
    ["Repairs and Maintenance", "Common-area repair and maintenance"],
    ["Office and Administrative", "Supplies, printing and administrative costs"],
    ["Community Activities", "Assemblies, events and community programs"],
  ] as const) {
    await prisma.expenseCategory.upsert({ where: { name }, update: { description, active: true }, create: { name, description } });
  }

  for (const [name, description] of [
    ["SSS", "Government social security contribution"],
    ["PhilHealth", "Government health insurance contribution"],
    ["Pag-IBIG", "Government housing fund contribution"],
    ["Cash Advance", "Employee-specific cash advance repayment"],
    ["Loan Payment", "Employee-specific loan repayment"],
  ] as const) {
    await prisma.payrollDeductionType.upsert({
      where: { name },
      update: { description },
      create: { name, description, amount: 0, active: false, applyToMonthly: true, applyToDaily: true },
    });
  }

  for (const type of Object.values(DocumentType)) {
    await prisma.documentTemplate.upsert({
      where: { type },
      update: {},
      create: { type, title: type.replaceAll("_", " "), body: "Managed by the HOA document generation service." },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
