import { z } from "zod";
import { paymentMethodRequiresReference } from "@/lib/payment-methods";

const currency = z.coerce.number().finite().nonnegative().max(10_000_000);
const required = z.string().trim().min(1, "This field is required.").max(500);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(72),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid registered email address."),
});

export const testEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid test recipient email address."),
});

export const emailSettingsSchema = z.object({
  MAIL_PROVIDER: z.enum(["gmail", "smtp"]),
  MAIL_HOST: z.string().trim().min(3, "Enter a valid SMTP host.").max(253),
  MAIL_PORT: z.coerce.number().int().min(1).max(65535),
  MAIL_ENCRYPTION: z.enum(["tls", "ssl", "none"]),
  MAIL_FROM_NAME: z.string().trim().min(2).max(100),
  MAIL_FROM_ADDRESS: z.string().trim().toLowerCase().email("Enter a valid sender email address."),
  PASSWORD_RESET_EXPIRY_MINUTES: z.coerce.number().int().min(30).max(60),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(72),
  PASSWORD_REQUIRE_UPPERCASE: z.enum(["true", "false"]),
  PASSWORD_REQUIRE_LOWERCASE: z.enum(["true", "false"]),
  PASSWORD_REQUIRE_NUMBER: z.enum(["true", "false"]),
  PASSWORD_REQUIRE_SPECIAL: z.enum(["true", "false"]),
});

export const homeownerSchema = z.object({
  id: z.string().optional(),
  name: required.max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().max(72).optional(),
  phone: required.max(30),
  birthDate: z.string().date().or(z.literal("")).optional(),
  civilStatus: z.string().trim().max(50).optional(),
  citizenship: z.string().trim().max(80).optional(),
  occupation: z.string().trim().max(120).optional(),
  residencyDate: z.string().date().or(z.literal("")).optional(),
  phase: z.string().trim().max(100).optional(),
  propertyType: z.string().trim().max(80).optional(),
  occupancyStatus: z.string().trim().max(80).optional(),
  address: required.max(250),
  block: required.max(30),
  lot: required.max(30),
  messengerId: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  monthlyDuesAmount: currency.positive("Monthly dues must be greater than zero."),
});

export const billSchema = z.object({
  id: z.string().optional(),
  homeownerId: z.string().min(1),
  billingMonth: z.string().date(),
  dueDate: z.string().date(),
  amount: currency.positive(),
  penalty: currency,
  status: z.enum(["PAID", "PARTIAL", "UNPAID", "OVERDUE"]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const duesExemptionSchema = z.object({
  homeownerId: z.string().min(1, "Select a homeowner."),
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/, "Choose a valid billing month."),
  reason: required.max(500),
});

const coverageMonthSchema = z.string().trim().regex(/^(?:[1-9]|1[0-2])$/, "Choose a valid coverage month.").transform(Number);
const coverageYearSchema = z.string().trim().regex(/^\d{4}$/, "Enter a valid four-digit coverage year.").transform(Number).refine((year) => year >= 1900 && year <= 2200, "Coverage year must be between 1900 and 2200.");

export const paymentSchema = z.object({
  amount: currency.positive("Payment amount must be greater than zero."),
  paymentDate: z.string().date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "GCASH", "CHECK", "OTHER"]),
  coverageFromMonth: coverageMonthSchema,
  coverageFromYear: coverageYearSchema,
  coverageToMonth: coverageMonthSchema,
  coverageToYear: coverageYearSchema,
  referenceNumber: z.string().trim().max(100).optional().default(""),
  remarks: z.string().trim().max(500).optional(),
}).superRefine((data, context) => {
  if (paymentMethodRequiresReference(data.method) && !data.referenceNumber) {
    context.addIssue({ code: "custom", path: ["referenceNumber"], message: "Reference number is required for non-cash payments." });
  }
  const coverageFrom = data.coverageFromYear * 12 + data.coverageFromMonth;
  const coverageTo = data.coverageToYear * 12 + data.coverageToMonth;
  if (coverageTo < coverageFrom) {
    context.addIssue({ code: "custom", path: ["coverageToMonth"], message: "Coverage To must not be earlier than Coverage From." });
  }
});

export const paymentAmountUpdateSchema = z.object({
  id: z.string().min(1, "Payment record is required."),
  amount: z.string({ message: "Payment amount is required." }).trim()
    .min(1, "Payment amount is required.")
    .refine((value) => Number.isFinite(Number(value)), "Payment amount must be numeric.")
    .transform(Number)
    .pipe(z.number().positive("Payment amount must be greater than zero.").max(10_000_000)),
  reason: z.string().trim().max(500).optional(),
});

export const paymentVoidSchema = z.object({
  id: z.string().min(1, "Payment record is required."),
  reason: z.string().trim().max(500).optional(),
});

export const paymentRequestSchema = z.object({
  transactionType: z.enum(["MONTHLY_DUES", "GATE_PASS", "STICKER", "MEMBERSHIP", "CONSTRUCTION_BOND", "OTHER"]),
  collectionType: z.enum(["GATE_PASS", "STICKER", "MEMBERSHIP", "CONSTRUCTION_BOND", "OTHER"]).optional(),
  description: z.string().trim().max(150).optional(),
  amount: currency.optional(),
  paymentDate: z.string().date(),
  referenceNumber: required.max(100),
  proofImageUrl: z.union([z.string().trim().url("Enter a valid proof image URL."), z.literal("")]).optional(),
  payerNotes: z.string().trim().max(500).optional(),
});

export const paymentReviewSchema = z.object({
  id: z.string().min(1),
  reviewRemarks: z.string().trim().max(500).optional(),
});

export const vehicleSchema = z.object({
  id: z.string().optional(),
  homeownerId: z.string().min(1, "Select a homeowner."),
  plateNumber: required.max(30).transform((value) => value.toUpperCase()),
  vehicleType: required.max(50),
  make: required.max(80),
  model: required.max(80),
  color: required.max(50),
  stickerNumber: required.max(50).transform((value) => value.toUpperCase()),
  stickerCollectionId: z.string().optional(),
  issuedAt: z.string().date(),
  expiresAt: z.union([z.string().date(), z.literal("")]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]),
  remarks: z.string().trim().max(500).optional(),
});

export const contractorSchema = z.object({
  id: z.string().optional(),
  companyName: required.max(150),
  contactPerson: required.max(100),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  phone: required.max(30),
  address: required.max(250),
  licenseNumber: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const collectionSchema = z.object({
  type: z.enum(["GATE_PASS", "STICKER", "MEMBERSHIP", "CONSTRUCTION_BOND", "CONTRACTOR_BOND", "OTHER"]),
  description: z.string().trim().max(150).optional(),
  payerType: z.enum(["HOMEOWNER", "CONTRACTOR"]),
  homeownerId: z.string().optional(),
  contractorId: z.string().optional(),
  amount: currency.positive(),
  collectionDate: z.string().date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "GCASH", "CHECK", "OTHER"]),
  referenceNumber: z.string().trim().max(100).optional(),
  remarks: z.string().trim().max(500).optional(),
});

export const bondRefundSchema = z.object({
  collectionId: z.string().min(1),
  amount: currency.positive(),
  refundDate: z.string().date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "GCASH", "CHECK", "OTHER"]),
  referenceNumber: z.string().trim().max(100).optional(),
  remarks: z.string().trim().max(500).optional(),
});

export const employeeSchema = z.object({
  id: z.string().optional(),
  employeeNumber: required.max(30),
  name: required.max(100),
  position: required.max(100),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  phone: required.max(30),
  address: required.max(250),
  hireDate: z.string().date(),
  salaryType: z.enum(["DAILY", "MONTHLY"]),
  baseRate: currency.positive("Salary rate must be greater than zero."),
  standardWorkDays: z.coerce.number().int().min(1).max(31),
  fixedAllowance: currency,
  fixedDeduction: currency,
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const optionalTime = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional();

export const attendanceSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string().min(1),
  date: z.string().date(),
  timeIn: optionalTime,
  timeOut: optionalTime,
  status: z.enum(["PRESENT", "HALF_DAY", "ABSENT", "PAID_LEAVE", "UNPAID_LEAVE", "HOLIDAY"]),
  overtimeHours: z.coerce.number().finite().nonnegative().max(24),
  adjustmentReason: z.string().trim().max(500).optional(),
  remarks: z.string().trim().max(500).optional(),
});

export const employeeClockSchema = z.object({
  remarks: z.string().trim().max(500).optional(),
  timeInRemarks: z.string().trim().max(500).optional(),
  timeOutRemarks: z.string().trim().max(500).optional(),
});

export const attendanceCorrectionRequestSchema = z.object({
  date: z.string().date(),
  correctTimeIn: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid corrected time in."),
  correctTimeOut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid corrected time out."),
  remarks: required.max(500),
});

export const attendanceAdjustmentReviewSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewRemarks: z.string().trim().max(500).optional(),
});

export const payrollPeriodSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  payDate: z.string().date(),
});

export const overtimeRecordSchema = z.object({
  employeeId: z.string().min(1, "Select an employee."),
  date: z.string().date(),
  hours: z.coerce.number().finite().positive("OT hours must be greater than zero.").max(24),
  source: z.enum(["APPROVED_REQUEST", "PAYROLL_MANAGER_ADJUSTMENT"]),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
  reason: required.max(500),
});

export const payrollDeductionTypeSchema = z.object({
  id: z.string().optional(),
  name: required.max(100),
  description: z.string().trim().max(500).optional(),
  amount: currency,
  active: z.boolean(),
  applyToMonthly: z.boolean(),
  applyToDaily: z.boolean(),
}).refine((value) => value.applyToMonthly || value.applyToDaily, { message: "Choose at least one salary type for this deduction." });

export const employeeLoanSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string().min(1, "Select an employee."),
  type: z.enum(["CASH_ADVANCE", "LOAN", "OTHER"]),
  description: required.max(150),
  principalAmount: currency.positive("Loan or cash advance amount must be greater than zero."),
  issuedDate: z.string().date(),
  referenceNumber: z.string().trim().max(100).optional(),
  remarks: z.string().trim().max(500).optional(),
});

export const payrollDeductionSchema = z.object({
  id: z.string().optional(),
  payrollId: z.string().min(1, "Select a payroll period."),
  employeeId: z.string().min(1, "Select an employee."),
  deductionTypeId: z.string().min(1, "Select a deduction type."),
  employeeLoanId: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  amount: currency.positive("Deduction amount must be greater than zero."),
  remarks: z.string().trim().max(500).optional(),
});

export const payrollAccessSchema = z.object({
  userId: z.string().min(1, "Select a user."),
  role: z.enum(["PAYROLL_MANAGER", "PAYROLL_STAFF", "HR_ADMIN", "FINANCE_APPROVER", "SYSTEM_ADMINISTRATOR", "READ_ONLY_AUDITOR"]),
  active: z.boolean(),
});

export const payrollCalendarSchema = z.object({
  id: z.string().optional(),
  date: z.string().date(),
  type: z.enum(["REGULAR_HOLIDAY", "SPECIAL_NON_WORKING_HOLIDAY", "SPECIAL_WORKING_HOLIDAY", "HOA_DECLARED_HOLIDAY", "WORKING_DAY", "NON_WORKING_DAY"]),
  description: required.max(150),
  payRule: required.max(300),
  active: z.boolean(),
});

export const employeeScheduleSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string().min(1, "Select an employee."),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  shiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid start time."),
  shiftEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid end time."),
  restDay: z.boolean(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.union([z.string().date(), z.literal("")]).optional(),
});

export const employeeScheduleRangeSchema = z.object({
  employeeId: z.string().min(1, "Select an employee."),
  shiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid start time."),
  shiftEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid end time."),
  effectiveFrom: z.string().date(),
  effectiveTo: z.union([z.string().date(), z.literal("")]).optional(),
  restDays: z.array(z.string()).optional(),
}).refine((value) => value.shiftStart !== value.shiftEnd, { message: "Shift start and end time cannot be the same." })
  .refine((value) => !value.effectiveTo || value.effectiveFrom <= value.effectiveTo, { message: "Effective from must be on or before effective to." });

export const chatStartSchema = z.object({
  recipientId: z.string().min(1, "Select a recipient."),
  subject: z.string().trim().max(150).optional(),
  message: required.max(3000),
  attachmentUrl: z.union([z.string().trim().url(), z.literal("")]).optional(),
  attachmentName: z.string().trim().max(150).optional(),
  attachmentContentType: z.string().trim().max(100).optional(),
});

export const chatMessageSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().trim().max(3000).optional(),
  attachmentUrl: z.union([z.string().trim().url(), z.literal("")]).optional(),
  attachmentName: z.string().trim().max(150).optional(),
  attachmentContentType: z.string().trim().max(100).optional(),
}).refine((value) => Boolean(value.message || value.attachmentUrl), { message: "Enter a message or attachment URL." });

export const chatDeleteSchema = z.object({
  conversationId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  mode: z.enum(["ME", "EVERYONE"]),
});

export const expenseCategorySchema = z.object({
  id: z.string().optional(),
  name: required.max(100),
  description: z.string().trim().max(500).optional(),
  active: z.boolean(),
});

export const expenseSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().min(1),
  description: required.max(250),
  payee: required.max(150),
  amount: currency.positive(),
  expenseDate: z.string().date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "GCASH", "CHECK", "OTHER"]),
  referenceNumber: z.string().trim().max(100).optional(),
  voucherNumber: z.string().trim().max(100).optional(),
  remarks: z.string().trim().max(500).optional(),
});

export const announcementSchema = z.object({
  id: z.string().optional(),
  title: required.max(150),
  content: required.max(5000),
  type: z.enum(["GENERAL", "URGENT", "REMINDER", "MAINTENANCE", "MEETING", "OTHER"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  existingImageUrl: z.string().trim().max(500).optional(),
  removeImage: z.boolean().optional(),
  sendEmail: z.boolean(),
  postToFacebook: z.boolean(),
});

export const eventSchema = z.object({
  id: z.string().optional(),
  title: required.max(150),
  description: required.max(3000),
  type: z.enum(["COMMUNITY", "MEETING", "ACTIVITY", "MAINTENANCE", "OTHER"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  eventDate: z.string().date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid start time."),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid end time."),
  existingImageUrl: z.string().trim().max(500).optional(),
  removeImage: z.boolean().optional(),
  location: required.max(250),
  postToFacebook: z.boolean(),
}).refine((value) => value.startTime < value.endTime, { message: "End time must be after start time." });

export function parsedForm<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  const object = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(object);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Please check the form fields.");
  return parsed.data;
}
