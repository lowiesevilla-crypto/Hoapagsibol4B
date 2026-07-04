import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";
import { SignJWT } from "jose/jwt/sign";

const prisma = new PrismaClient();
const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const chatComponentSource = await readFile(new URL("../components/chat-messenger.tsx", import.meta.url), "utf8");
const authSecret = envText.match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
if (!authSecret) throw new Error("AUTH_SECRET not found");
const secret = new TextEncoder().encode(authSecret);
const base = "http://localhost:3000";
const checks = [];

function check(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

async function tokenFor(user) {
  return new SignJWT({ userId: user.id, role: user.role, tenantId: user.tenantId, tenantSlug: "pagsibol4b" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(secret);
}

async function get(path, token) {
  return fetch(`${base}${path}`, { headers: token ? { Cookie: `hoa_session=${token}` } : {}, redirect: "manual" });
}

async function jsonRequest(path, token, method, body) {
  return fetch(`${base}${path}`, {
    method,
    headers: { Cookie: `hoa_session=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

async function text(path, token) {
  const response = await get(path, token);
  return { response, body: await response.text() };
}

try {
  const legacyFixtureReady = await prisma.user.count({ where: { role: "HOMEOWNER", homeownerProfile: { is: { payments: { some: {} }, collections: { some: {} }, vehicles: { some: {} } } } } });
  if (!legacyFixtureReady) {
    console.log("SKIP legacy demo-fixture smoke: the requested production cleanup removed demonstration homeowners and transactions. Run the production-safe enhancement, migration, document-action, and system-admin suites instead.");
  } else {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: { in: ["ADMIN", "SYSTEM_ADMIN"] } }, orderBy: { email: "asc" } });
  const homeowner = await prisma.user.findFirstOrThrow({
    where: {
      role: "HOMEOWNER",
      homeownerProfile: {
        is: {
          payments: { some: { receiptNumber: { not: null } } },
          collections: { some: { receiptNumber: { not: null } } },
          vehicles: { some: {} },
        },
      },
    },
    include: { homeownerProfile: { include: { vehicles: true } } },
    orderBy: { email: "asc" },
  });
  const employeeUser = await prisma.user.findFirstOrThrow({
    where: { role: "EMPLOYEE", employeeProfile: { isNot: null } },
    include: { employeeProfile: true },
    orderBy: { email: "asc" },
  });
  const paymentRecord = await prisma.payment.findFirstOrThrow({ where: { homeownerId: homeowner.homeownerProfile.id, receiptNumber: { not: null } } });
  const homeownerCollectionRecord = await prisma.collection.findFirstOrThrow({ where: { homeownerId: homeowner.homeownerProfile.id, receiptNumber: { not: null } } });
  const contractorCollectionRecord = await prisma.collection.findFirstOrThrow({ where: { contractorId: { not: null }, receiptNumber: { not: null } } });
  const payslipRecord = await prisma.payslip.findFirstOrThrow({ include: { employee: true, payroll: true } });
  const employeePaidPayslip = await prisma.payslip.findFirstOrThrow({
    where: { employeeId: employeeUser.employeeProfile.id, payroll: { status: "PAID" } },
    include: { employee: true, payroll: true },
  });
  const publishedAnnouncement = await prisma.announcement.findFirstOrThrow({ where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" } });
  const publishedEvent = await prisma.event.findFirstOrThrow({ where: { status: "PUBLISHED" }, orderBy: { eventDate: "asc" } });
  const paymentRequestRecord = await prisma.paymentRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  const otherVehicle = await prisma.vehicle.findFirst({ where: { homeownerId: { not: homeowner.homeownerProfile.id } } });
  check(await compare("ChangeMe123!", admin.passwordHash), "admin password is valid");
  const adminToken = await tokenFor(admin);
  const homeownerToken = await tokenFor(homeowner);
  const employeeToken = await tokenFor(employeeUser);

  const { response: login, body: loginHtml } = await text("/login");
  check(login.status === 200, "login page returns HTTP 200");
  check(loginHtml.includes("PAGSIBOL VILLAGE PH2 4B EAST"), "login page shows updated association name");
  check(loginHtml.includes("Show password"), "login page includes show/hide password toggle");
  check(loginHtml.includes('name="viewport"') && loginHtml.includes("width=device-width"), "responsive viewport metadata is present");
  check(loginHtml.includes("brand-hero") && loginHtml.includes("from-leaf-500"), "login page delivers the logo-matched blue and green brand treatment");

  const logo = await get("/pagsibol-logo.png");
  check(logo.status === 200 && logo.headers.get("content-type")?.startsWith("image/png"), "association logo is served as PNG");

  const anonymousAdmin = await get("/admin/dashboard");
  check([307, 308].includes(anonymousAdmin.status) && anonymousAdmin.headers.get("location")?.endsWith("/login"), "anonymous admin access redirects to login");

  const { response: dashboard, body: dashboardHtml } = await text("/admin/dashboard", adminToken);
  check(dashboard.status === 200, "authenticated admin dashboard returns HTTP 200");
  check(dashboardHtml.includes("Refundable bonds held") && dashboardHtml.includes("Expenses this month"), "dashboard includes income, expense and bond metrics");
  check(dashboardHtml.includes("Human resources") && dashboardHtml.includes("Community") && dashboardHtml.includes("sticky top-0"), "grouped responsive navigation renders");

  const { response: dataPage, body: dataHtml } = await text("/admin/data", adminToken);
  check(dataPage.status === 200 && dataHtml.includes("Bulk data upload and download"), "admin bulk data page renders");
  check(dataHtml.includes("Validate and import") && dataHtml.includes("Download templates and backups"), "bulk upload and template/export UI renders");
  const template = await get("/admin/data/template?type=homeowners", adminToken);
  const templateText = await template.text();
  check(template.status === 200 && templateText.includes("name") && templateText.includes("monthlyDuesAmount"), "homeowner CSV template downloads");
  const exportResponse = await get("/admin/data/export?type=vehicles", adminToken);
  const exportText = await exportResponse.text();
  check(exportResponse.status === 200 && exportText.includes("plateNumber") && exportText.includes("stickerNumber"), "vehicle CSV export downloads");

  const { response: collectionsPage, body: collectionsHtml } = await text("/admin/collections", adminToken);
  check(collectionsPage.status === 200, "admin collections page returns HTTP 200");
  check(collectionsHtml.includes("Gate Pass") && collectionsHtml.includes("Construction Bond") && collectionsHtml.includes("Contractor Bond"), "collection types render in the ledger");
  check(collectionsHtml.includes("Record a collection") && collectionsHtml.includes("Refund a bond"), "collection and bond refund forms render");
  check(collectionsHtml.includes("Search payer, collection type or status"), "collection ledger search renders");

  const { response: contractorsPage, body: contractorsHtml } = await text("/admin/contractors", adminToken);
  check(contractorsPage.status === 200 && (contractorsHtml.includes("Eastline") || contractorsHtml.includes("TEST")), "separate contractor directory renders contractor profiles");

  const { response: reportsPage, body: reportsHtml } = await text("/admin/reports", adminToken);
  check(reportsPage.status === 200 && reportsHtml.includes("Statement of Income and Expenses") && reportsHtml.includes("Statement of Cash Receipts and Disbursements"), "HOA financial statements render");
  check(reportsHtml.includes("Employee payroll") && reportsHtml.includes("Refundable bond accountability"), "financial report includes payroll and bond schedules");
  check(reportsHtml.includes("PDF report") && reportsHtml.includes("Word report"), "financial report offers PDF and Word downloads");

  const pdfReport = await get("/admin/reports/pdf?from=2026-01-01&to=2026-12-31", adminToken);
  const pdfBytes = new Uint8Array(await pdfReport.arrayBuffer());
  check(pdfReport.status === 200 && pdfReport.headers.get("content-type") === "application/pdf" && String.fromCharCode(...pdfBytes.slice(0, 4)) === "%PDF" && pdfBytes.length > 3000, "branded financial PDF downloads as a valid PDF document");
  const wordReport = await get("/admin/reports/docx?from=2026-01-01&to=2026-12-31", adminToken);
  const wordBytes = new Uint8Array(await wordReport.arrayBuffer());
  check(wordReport.status === 200 && wordReport.headers.get("content-type")?.includes("officedocument.wordprocessingml.document") && String.fromCharCode(...wordBytes.slice(0, 2)) === "PK" && wordBytes.length > 3000, "financial report downloads as a valid Word document");

  const { response: paymentsPage, body: paymentsHtml } = await text("/admin/payments", adminToken);
  check(paymentsPage.status === 200 && paymentsHtml.includes("Payment tracking") && paymentsHtml.includes("QR / GCash payment requests"), "payment tracking and QR review page renders");
  check(paymentsHtml.includes("Details / proof"), "QR proof review links render");

  const { response: paymentRequestPage, body: paymentRequestHtml } = await text(`/admin/payments/requests/${paymentRequestRecord.id}`, adminToken);
  check(paymentRequestPage.status === 200 && paymentRequestHtml.includes("Payment request details"), "QR/GCash payment request detail page renders");
  check(paymentRequestHtml.includes("Uploaded payment screenshot") && paymentRequestHtml.includes("Submitted") && paymentRequestHtml.includes("Status"), "payment request proof and status details render");

  const { response: billingPage, body: billingHtml } = await text("/admin/billing", adminToken);
  check(billingPage.status === 200 && billingHtml.includes("Monthly dues exemptions"), "billing management renders month-specific dues exemptions");

  const { response: vehiclesPage, body: vehiclesHtml } = await text("/admin/vehicles", adminToken);
  const homeownerPlate = homeowner.homeownerProfile.vehicles[0]?.plateNumber ?? "";
  check(vehiclesPage.status === 200 && vehiclesHtml.includes("Vehicle and sticker monitoring") && vehiclesHtml.includes(homeownerPlate), "admin vehicle and sticker monitoring renders records");

  const { response: homeownerVehicles, body: homeownerVehiclesHtml } = await text("/portal/vehicles", homeownerToken);
  check(homeownerVehicles.status === 200 && homeownerVehiclesHtml.includes(homeownerPlate), "homeowner sees vehicles registered to their own profile");
  if (otherVehicle) check(!homeownerVehiclesHtml.includes(otherVehicle.plateNumber), "homeowner cannot see another homeowner vehicle");

  const { response: announcementsPage, body: announcementsHtml } = await text("/admin/announcements", adminToken);
  check(announcementsPage.status === 200 && announcementsHtml.includes("Post automatically to Facebook") && announcementsHtml.includes("Post to Facebook"), "announcement Facebook Page publishing controls render");
  check(announcementsHtml.includes("Uploaded image or banner picture") && announcementsHtml.includes("Announcement Type") && announcementsHtml.includes("ARCHIVED") && announcementsHtml.includes("Publish"), "admin announcement image, type and status controls render");
  check(announcementsHtml.includes("Description / Content") && announcementsHtml.includes("Date posted") && announcementsHtml.includes("View announcement details"), "announcement form and details render validation-ready fields");
  const { response: eventsPage, body: eventsHtml } = await text("/admin/events", adminToken);
  check(eventsPage.status === 200 && eventsHtml.includes("Post automatically to the HOA Facebook Page") && eventsHtml.includes("Post to Facebook"), "event Facebook Page publishing controls render");
  check(eventsHtml.includes("Uploaded image or banner picture") && eventsHtml.includes("Event Type") && eventsHtml.includes("Start Time") && eventsHtml.includes("End Time") && eventsHtml.includes("Archive"), "admin event image, time and status controls render");
  const { response: portalAnnouncementsPage, body: portalAnnouncementsHtml } = await text("/portal/announcements", homeownerToken);
  check(portalAnnouncementsPage.status === 200 && portalAnnouncementsHtml.includes("Read More / View Details") && portalAnnouncementsHtml.includes(publishedAnnouncement.title), "published announcements render as homeowner cards");
  const { response: portalAnnouncementDetail, body: portalAnnouncementDetailHtml } = await text(`/portal/announcements/${publishedAnnouncement.id}`, homeownerToken);
  check(portalAnnouncementDetail.status === 200 && portalAnnouncementDetailHtml.includes(publishedAnnouncement.title) && portalAnnouncementDetailHtml.includes("Announcement Details"), "published announcement detail page renders");
  const { response: portalEventsPage, body: portalEventsHtml } = await text("/portal/events", homeownerToken);
  check(portalEventsPage.status === 200 && portalEventsHtml.includes("Read More / View Details") && portalEventsHtml.includes(publishedEvent.title), "published events render as homeowner cards");
  const { response: portalEventDetail, body: portalEventDetailHtml } = await text(`/portal/events/${publishedEvent.id}`, homeownerToken);
  check(portalEventDetail.status === 200 && portalEventDetailHtml.includes(publishedEvent.title) && portalEventDetailHtml.includes("Event Details"), "published event detail page renders");

  const { response: employeesPage, body: employeesHtml } = await text("/admin/employees", adminToken);
  check(employeesPage.status === 200 && (employeesHtml.includes("EMP-001") || employeesHtml.includes("TEST-EMP")), "employee profiles render");

  const { response: attendancePage, body: attendanceHtml } = await text("/admin/attendance", adminToken);
  check(attendancePage.status === 200 && attendanceHtml.includes("Employee attendance") && attendanceHtml.includes("late") && attendanceHtml.includes("overtime"), "attendance management renders payroll-ready records");
  check(attendanceHtml.includes("Attendance filters") && attendanceHtml.includes("Payroll Status") && attendanceHtml.includes("Apply bulk review"), "attendance filters, payroll status and bulk correction review render");
  check(attendanceHtml.includes("Read-only") || attendanceHtml.includes("Paid locked") || attendanceHtml.includes(">Paid<"), "paid attendance lock indicators render");

  const { response: employeeAttendancePage, body: employeeAttendanceHtml } = await text("/employee/attendance", employeeToken);
  check(employeeAttendancePage.status === 200 && employeeAttendanceHtml.includes("Clock in / clock out") && employeeAttendanceHtml.includes("Correction requests"), "employee clock-in self-service renders");
  check(employeeAttendanceHtml.includes("Time In Remarks") && employeeAttendanceHtml.includes("Time Out Remarks") && employeeAttendanceHtml.includes("Correct Time In") && employeeAttendanceHtml.includes("Correct Time Out"), "employee attendance uses simplified time remarks and correction form");
  const { response: employeePayslipsPage, body: employeePayslipsHtml } = await text("/employee/payslips", employeeToken);
  check(employeePayslipsPage.status === 200 && employeePayslipsHtml.includes("My payslips") && employeePayslipsHtml.includes("Download PDF"), "employee paid payslip history renders");
  const { response: employeePayslipPrint, body: employeePayslipPrintHtml } = await text(`/employee/payslips/${employeePaidPayslip.id}`, employeeToken);
  check(employeePayslipPrint.status === 200 && employeePayslipPrintHtml.includes("Employee Payslip") && employeePayslipPrintHtml.includes("NET PAY"), "employee can view and print own paid payslip");
  const employeePayslipPdf = await get(`/employee/payslips/${employeePaidPayslip.id}/pdf`, employeeToken);
  const employeePayslipPdfBytes = new Uint8Array(await employeePayslipPdf.arrayBuffer());
  check(employeePayslipPdf.status === 200 && employeePayslipPdf.headers.get("content-type") === "application/pdf" && String.fromCharCode(...employeePayslipPdfBytes.slice(0, 4)) === "%PDF", "employee can download own paid payslip PDF");

  const { response: adminChatPage, body: adminChatHtml } = await text("/admin/chat", adminToken);
  check(adminChatPage.status === 200 && adminChatHtml.includes("HOA Chat Center") && adminChatHtml.includes("Conversations"), "admin chat center renders");
  check(!adminChatHtml.includes("Search conversations") && adminChatHtml.includes("Search people, unit, employee ID") && adminChatHtml.includes("Back"), "chat UI removes conversation search and renders mobile back control");
  check(adminChatHtml.includes("h-dvh") && adminChatHtml.includes("h-[var(--chat-viewport-height,100dvh)]") && adminChatHtml.includes("overflow-y-auto") && adminChatHtml.includes("shrink-0"), "mobile chat layout keeps history scrollable and input visible");
  check(chatComponentSource.includes("Loading chat history") && chatComponentSource.includes("No messages yet") && chatComponentSource.includes("[overflow-wrap:anywhere]"), "chat includes loading, empty, and long-message wrapping states");
  const { response: portalChatPage, body: portalChatHtml } = await text("/portal/chat", homeownerToken);
  check(portalChatPage.status === 200 && portalChatHtml.includes("Message the HOA") && portalChatHtml.includes("Online users"), "homeowner chat page renders");
  const { response: employeeChatPage, body: employeeChatHtml } = await text("/employee/chat", employeeToken);
  check(employeeChatPage.status === 200 && employeeChatHtml.includes("Employee Messages") && employeeChatHtml.includes("Start a conversation"), "employee chat page renders");
  const chatApi = await get("/api/chat", adminToken);
  const chatApiJson = await chatApi.json();
  check(chatApi.status === 200 && chatApiJson.settings.allowedMimeTypes.includes("image/png") && chatApiJson.settings.maxAttachmentMb >= 1, "chat API exposes admin-configurable upload rules");
  const openChat = await jsonRequest("/api/chat/conversations", adminToken, "POST", { recipientId: homeowner.id });
  const openChatJson = await openChat.json();
  check(openChat.status === 200 && openChatJson.conversationId, "one-click chat opens or creates a direct conversation");
  const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 160, 137, 164, 154, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  const uploadForm = new FormData();
  uploadForm.append("files", new File([pngBytes], "smoke-chat.png", { type: "image/png" }));
  const upload = await fetch(`${base}/api/chat/upload`, { method: "POST", headers: { Cookie: `hoa_session=${adminToken}` }, body: uploadForm, redirect: "manual" });
  const uploadJson = await upload.json();
  check(upload.status === 200 && uploadJson.files?.[0]?.url?.startsWith("/uploads/chat/"), "chat upload accepts image attachments and returns a stored URL");
  const uploadedAttachment = await get(uploadJson.files[0].url, adminToken);
  check(uploadedAttachment.status === 200 && uploadedAttachment.headers.get("content-type")?.startsWith("image/png"), "uploaded chat attachment URL can be opened for preview or download");
  const sendChat = await jsonRequest("/api/chat/messages", adminToken, "POST", { conversationId: openChatJson.conversationId, message: "Smoke test chat message with attachment", attachments: uploadJson.files });
  const sendChatJson = await sendChat.json();
  const sentMessage = sendChatJson.selectedConversation?.messages?.find((message) => message.body === "Smoke test chat message with attachment");
  check(sendChat.status === 200 && sentMessage?.attachments?.length >= 1, "chat API sends a message with multiple-attachment data model support");
  const pinChat = await jsonRequest("/api/chat/conversations", adminToken, "PATCH", { conversationId: openChatJson.conversationId, pinned: true });
  const pinChatJson = await pinChat.json();
  check(pinChat.status === 200 && pinChatJson.conversations?.find((conversation) => conversation.id === openChatJson.conversationId)?.pinned, "chat conversation can be pinned");

  const { response: payrollPage, body: payrollHtml } = await text("/admin/payroll", adminToken);
  check(payrollPage.status === 200 && payrollHtml.includes("Payroll &amp; payslips"), "payroll module returns HTTP 200");
  check(payrollHtml.includes("Employee Master Data") && payrollHtml.includes("Attendance Management") && payrollHtml.includes("Government Contributions"), "payroll section navigation renders");
  check(payrollHtml.includes("Confidential payroll module") && payrollHtml.includes("Payroll access is separate from general Admin access"), "payroll confidentiality notice renders");
  check(payrollHtml.includes("Total payroll amount") && payrollHtml.includes("Net payroll:"), "payroll page shows total payroll amount");
  check(payrollHtml.includes("Return to draft") || payrollHtml.includes("Paid payroll period is locked") || payrollHtml.includes("Finalize"), "payroll page shows state-aware payroll controls");

  const { response: payrollSettings, body: payrollSettingsHtml } = await text("/admin/payroll?section=settings", adminToken);
  check(payrollSettings.status === 200 && payrollSettingsHtml.includes("Payroll deduction types") && payrollSettingsHtml.includes("Payroll role assignments") && payrollSettingsHtml.includes("Recent payroll audit trail"), "payroll settings renders deduction, access and audit management");
  const { response: payrollCalendar, body: payrollCalendarHtml } = await text("/admin/payroll?section=calendar", adminToken);
  check(payrollCalendar.status === 200 && payrollCalendarHtml.includes("Holiday / working day") && payrollCalendarHtml.includes("Employee schedule range") && payrollCalendarHtml.includes("Rest Days"), "payroll calendar and schedule range section renders");
  const { response: payrollAdjustments, body: payrollAdjustmentsHtml } = await text("/admin/payroll?section=adjustments", adminToken);
  check(payrollAdjustments.status === 200 && payrollAdjustmentsHtml.includes("Employee-specific deductions"), "payroll adjustments section renders cutoff-specific deductions");
  check(payrollAdjustmentsHtml.includes("Select employee to load deductions") && payrollAdjustmentsHtml.includes("Selected employee balance") && payrollAdjustmentsHtml.includes("Apply to Balance"), "cutoff deduction UI filters balances by selected employee");
  const { response: payrollContributions, body: payrollContributionsHtml } = await text("/admin/payroll?section=contributions", adminToken);
  check(payrollContributions.status === 200 && payrollContributionsHtml.includes("Government contributions"), "payroll government contributions section renders");
  const { response: payrollReports, body: payrollReportsHtml } = await text("/admin/payroll?section=reports", adminToken);
  check(payrollReports.status === 200 && payrollReportsHtml.includes("Payroll financial reports"), "payroll reports section links to financial reports");

  const { response: payslipPage, body: payslipHtml } = await text(`/admin/payroll/${payslipRecord.id}/print`, adminToken);
  check(payslipPage.status === 200 && payslipHtml.includes("Employee Payslip") && payslipHtml.includes("NET PAY") && payslipHtml.includes(payslipRecord.employee.name), "printable payslip renders calculated salary");

  const { response: expensesPage, body: expensesHtml } = await text("/admin/expenses", adminToken);
  check(expensesPage.status === 200 && expensesHtml.includes("Record an expense"), "expense module renders");

  const { response: paymentReceipt, body: paymentReceiptHtml } = await text(`/receipts/payment/${paymentRecord.id}`, adminToken);
  check(paymentReceipt.status === 200 && paymentReceiptHtml.includes("Official Acknowledgement Receipt") && paymentReceiptHtml.includes(paymentRecord.receiptNumber), "printable dues acknowledgement receipt renders sequential number");
  check(paymentReceiptHtml.includes("In payment for") && paymentReceiptHtml.includes("Authorized signature") && paymentReceiptHtml.includes("Pesos Only"), "receipt includes purpose, amount in words and signature fields");

  const { response: collectionReceipt, body: collectionReceiptHtml } = await text(`/receipts/collection/${homeownerCollectionRecord.id}`, homeownerToken);
  check(collectionReceipt.status === 200 && collectionReceiptHtml.includes(homeownerCollectionRecord.receiptNumber), "homeowner can print own collection receipt");
  const forbiddenReceipt = await get(`/receipts/collection/${contractorCollectionRecord.id}`, homeownerToken);
  check([307, 308].includes(forbiddenReceipt.status) && forbiddenReceipt.headers.get("location")?.includes("/portal/dashboard"), "homeowner cannot print another payer's receipt");

  const { response: homeownerCollections, body: homeownerHtml } = await text("/portal/collections", homeownerToken);
  check(homeownerCollections.status === 200, "homeowner collections page returns HTTP 200");
  check(homeownerHtml.includes("Gate Pass") || homeownerHtml.includes("Construction Bond") || homeownerHtml.includes("Sticker"), "homeowner sees own fees or bonds");
  check(!homeownerHtml.includes("Contractor Bond"), "homeowner cannot see contractor bond records");

  const homeownerToAdmin = await get("/admin/collections", homeownerToken);
  check([307, 308].includes(homeownerToAdmin.status) && homeownerToAdmin.headers.get("location")?.includes("/portal/dashboard"), "homeowner role is blocked from admin collections");
  const homeownerToPayroll = await get("/admin/payroll", homeownerToken);
  check([307, 308].includes(homeownerToPayroll.status), "homeowner role is blocked from payroll");

  const [feeTotals, bondTotals, contractorCount, employeeCount, attendanceCount, payslipCount, expenseCount, vehicleCount, billCount, paymentRequestCount, missingPaymentReceipts, missingCollectionReceipts, payrollAccessCount, calendarDayCount, scheduleCount, chatCount, auditCount] = await Promise.all([
    prisma.collection.aggregate({ _sum: { amount: true }, where: { refundable: false } }),
    prisma.collection.aggregate({ _sum: { amount: true, amountRefunded: true, amountForfeited: true }, where: { refundable: true } }),
    prisma.contractorProfile.count(),
    prisma.employeeProfile.count(),
    prisma.attendance.count(),
    prisma.payslip.count(),
    prisma.expense.count(),
    prisma.vehicle.count(),
    prisma.bill.count(),
    prisma.paymentRequest.count(),
    prisma.payment.count({ where: { receiptNumber: null } }),
    prisma.collection.count({ where: { receiptNumber: null } }),
    prisma.payrollAccess.count({ where: { active: true } }),
    prisma.payrollCalendarDay.count(),
    prisma.employeeSchedule.count(),
    prisma.chatConversation.count(),
    prisma.auditLog.count({ where: { module: { in: ["PAYROLL", "ATTENDANCE", "CHAT"] } } }),
  ]);
  const held = Number(bondTotals._sum.amount ?? 0) - Number(bondTotals._sum.amountRefunded ?? 0) - Number(bondTotals._sum.amountForfeited ?? 0);
  check(Number(feeTotals._sum.amount ?? 0) >= 300, "fee collections are available as association income");
  check(held >= 1, "refundable bonds remain tracked as held liabilities");
  check(contractorCount >= 2, "contractor profile data exists");
  check(employeeCount >= 2 && attendanceCount >= 8, "employee attendance data exists");
  check(payslipCount >= 2 && Number(payslipRecord.netPay) > 0, "salary computation produced positive payslips");
  check(expenseCount >= 2, "categorized expense data exists");
  check(vehicleCount >= 2, "vehicle and sticker monitoring data exists");
  check(billCount >= 2, "billing data exists");
  check(paymentRequestCount >= 1, "QR/GCash payment request data exists");
  check(missingPaymentReceipts === 0 && missingCollectionReceipts === 0, "all existing collections have acknowledgement numbers");
  check(payrollAccessCount >= 1, "payroll access assignments exist");
  check(calendarDayCount >= 1 && scheduleCount >= 2, "payroll calendar and employee schedules exist");
  check(chatCount >= 1, "chat conversation history exists");
  check(auditCount >= 1, "payroll or chat audit log data exists");

  console.log(`PASS ${checks.length} checks`);
  for (const label of checks) console.log(`- ${label}`);
  }
} finally {
  await prisma.$disconnect();
}
