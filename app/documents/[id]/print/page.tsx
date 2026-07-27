import { headers } from "next/headers";
import QRCode from "qrcode";
import { AssociationLogo } from "@/components/association-logo";
import { DocumentPreview } from "@/components/document-preview";
import { IssuedDocumentPrintRunner } from "@/components/issued-document-print-runner";
import { getAccessibleGeneratedDocument } from "@/lib/document-access";
import { documentTypeLabel, isPassDocument } from "@/lib/services/documents";
import { getIssuedDocumentRenderSource, renderIssuedDocumentPrintHtml } from "@/lib/services/issued-document-export";
import { getAssociationSettings } from "@/lib/system-settings";
import { shortDate } from "@/lib/utils";

export default async function PrintDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, request } = await getAccessibleGeneratedDocument(id, { requireDownload: true });
  const currentVersion = request.versions[0] ?? null;
  if (currentVersion?.rendererName === "hoahub-safe-html") {
    const source = await getIssuedDocumentRenderSource(id, { requireDownload: true });
    return <DocumentOnlyPrint html={renderIssuedDocumentPrintHtml(source)} />;
  }
  const [currentAssociation, requestHeaders] = await Promise.all([getAssociationSettings(user.tenantId), headers()]);
  const association = request.associationSnapshot && typeof request.associationSnapshot === "object" ? { ...currentAssociation, ...request.associationSnapshot as Partial<typeof currentAssociation> } : currentAssociation;
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const verifyUrl = `${proto}://${host}/verify/documents/${request.verificationCode}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1, errorCorrectionLevel: "M" });
  return <DocumentPreview backHref={`/documents/${id}`} downloadHref={`/documents/${id}/pdf`}>{isPassDocument(request.type) ? <PassSheet request={request} association={association} qr={qrDataUrl} /> : request.type === "CERTIFICATE_OF_RESIDENCY" ? <ResidencySheet request={request} association={association} qr={qrDataUrl} /> : <ClearanceSheet request={request} association={association} qr={qrDataUrl} />}</DocumentPreview>;
}

function DocumentOnlyPrint({ html }: { html: string }) {
  return <main><div dangerouslySetInnerHTML={{ __html: html }} /><IssuedDocumentPrintRunner /></main>;
}

type Request = Awaited<ReturnType<typeof getAccessibleGeneratedDocument>>["request"];
type Association = Awaited<ReturnType<typeof getAssociationSettings>>;

function PassSheet({ request, association, qr }: { request: Request; association: Association; qr: string }) {
  const title = documentRequestTitle(request);
  const copies = [{ label: "HOA OFFICE COPY", color: "#379326", note: "Retain for HOA office records." }, { label: "HOMEOWNER COPY", color: "#0962b9", note: "Please keep this copy." }];
  return <article className="pass-sheet official-document-sheet overflow-hidden border border-slate-300 bg-white p-[4mm] text-[8px] text-slate-950">
    <header className="grid h-[25mm] grid-cols-[18mm_1fr_30mm] items-center gap-2"><AssociationLogo className="size-[17mm]" src={association.logoUrl} alt={`${association.name} logo`} /><div className="text-center"><h1 className="rounded-xl bg-blue-950 px-3 py-1 text-[15px] font-black text-white">{title.toUpperCase()}</h1><p className="mt-1 text-[11px] font-black">{association.name}</p><p>{association.address}</p><p>{[association.contactNumber, association.email].filter(Boolean).join(" | ")}</p></div><div className="font-bold"><p>PASS NO.</p><p className="text-red-600">{request.documentNumber}</p><p className="mt-1">DATE ISSUED</p><p>{shortDate(request.generatedAt!)}</p></div></header>
    <div className="space-y-[3mm]">{copies.map((copy, index) => <section key={copy.label} className="relative grid h-[100mm] grid-cols-[28mm_1fr_30mm] overflow-hidden border" style={{ borderColor: copy.color }}>
      <div className="grid place-content-center px-2 text-center text-white" style={{ backgroundColor: copy.color }}><p className="mx-auto grid size-9 place-items-center rounded-lg border-2 text-xl font-black">{index + 1}</p><p className="mt-2 break-words text-[9px] font-black leading-tight">{copy.label.replace(" COPY", "")}<br />COPY</p><p className="mt-3 text-[7px]">{copy.note}</p></div>
      <div className="grid grid-cols-3 content-start [&>div]:min-w-0 [&>div]:border-b [&>div]:border-r [&>div]:p-1.5"><Cell label="Type of pass" value={request.passType?.replaceAll("_", "-") || title} /><Cell label="Scheduled date / time" value={`${request.scheduledDate ? shortDate(request.scheduledDate) : "-"} ${request.startTime || ""}-${request.endTime || ""}`} /><Cell label="Valid until" value={request.validityDate ? shortDate(request.validityDate) : "-"} /><Cell label="Homeowner" value={request.homeowner.user.name} /><Cell label="Block & lot" value={`Block ${request.homeowner.block}, Lot ${request.homeowner.lot}`} /><Cell label="Contact number" value={request.homeowner.phone} /><Cell label="Vehicle / truck" value={request.vehicleDetails || "None specified"} /><Cell label="Contractor / mover" value={request.contractorDetails || request.partyName || "-"} /><Cell label="Driver / representative" value={request.representativeName || request.partyName || "-"} /><Cell wide label="Purpose / items" value={request.purpose || "-"} /><Cell label="Remarks" value={request.adminRemarks || request.remarks || "-"} /><Cell label="Processed by" value={officerName(request.processedOfficerSnapshot, request.processedByOfficer?.fullName || request.processedBy?.name)} /><Cell label="Approved by" value={officerName(request.approvedOfficerSnapshot, request.approvedByOfficer?.fullName || request.approvedBy?.name)} /><Cell label={index === 0 ? "Received by HOA office" : "Confirmed by homeowner"} value="________________" /></div>
      <div className="grid place-content-center px-1 text-center"><img className="mx-auto size-[20mm]" src={qr} alt="Verification QR" /><p className="mt-1 font-black">{request.documentNumber}</p><p>{copy.note}</p></div>
      {index < 2 && <div className="absolute -bottom-[2.3mm] left-0 w-full border-b border-dashed border-slate-500" />}
    </section>)}</div>
    <footer className="mt-[2mm] rounded-lg border border-blue-200 p-2 text-[7px] font-bold">IMPORTANT: This pass is valid only on the stated date and time. Present the applicable copy at the gate. Scan the QR code to verify authenticity.</footer>
  </article>;
}

function ResidencySheet({ request, association, qr }: { request: Request; association: Association; qr: string }) {
  const organization = Array.isArray(request.organizationSnapshot) ? request.organizationSnapshot as Array<Record<string, unknown>> : [];
  const issued = request.generatedAt || request.approvedAt || new Date();
  const validUntil = request.validityDate || new Date(Date.UTC(issued.getUTCFullYear() + 1, issued.getUTCMonth(), issued.getUTCDate()));
  const personal = [["Full Name", request.homeowner.user.name], ["Age", request.homeowner.birthDate ? String(ageAt(request.homeowner.birthDate, issued)) : "Not specified"], ["Civil Status", request.homeowner.civilStatus || "Not specified"], ["Citizenship", request.homeowner.citizenship || "Not specified"], ["Occupation", request.homeowner.occupation || "Not specified"], ["Date of Residency", request.homeowner.residencyDate ? shortDate(request.homeowner.residencyDate) : "Not specified"], ["Contact Number", request.homeowner.phone]];
  const property = [["Phase", request.homeowner.phase || association.name], ["Block & Lot", `Block ${request.homeowner.block} - Lot ${request.homeowner.lot}`], ["Property Address", request.homeowner.address], ["Type", request.homeowner.propertyType || "Not specified"], ["Status", request.homeowner.occupancyStatus || "Not specified"]];
  return <article className="residency-sheet official-document-sheet relative overflow-hidden border border-slate-300 bg-white p-[5mm] text-[9px] text-slate-950">
    <header className="grid h-[43mm] grid-cols-[30mm_1fr_53mm] gap-3 border-b-[3px] border-blue-950 pb-3"><AssociationLogo className="size-[29mm]" src={association.logoUrl} alt={`${association.name} logo`} /><div><h1 className="text-[18px] font-black uppercase leading-tight text-blue-950">{association.name}</h1><p className="mt-3 font-bold">{association.address}</p><p className="mt-1">{[association.contactNumber, association.email].filter(Boolean).join(" | ")}</p><p className="mt-2">SEC Registration No.: {association.secRegistrationNumber || "Not specified"}</p></div><div className="grid grid-cols-[1fr_24mm] gap-2 border-l pl-3"><div className="font-bold"><p className="text-[7px]">DOCUMENT NO.</p><p className="text-[10px] text-red-600">{request.documentNumber}</p><p className="mt-3 text-[7px]">DATE ISSUED</p><p>{shortDate(issued)}</p><p className="mt-3 text-[7px]">VALID UNTIL</p><p>{shortDate(validUntil)}</p></div><div className="text-center"><img className="size-[23mm]" src={qr} alt="Verification QR" /><p className="mt-1 text-[7px] font-black">SCAN TO VERIFY</p></div></div></header>
    <div className="mt-[7mm] grid grid-cols-[39mm_1fr] gap-[6mm]"><aside className="border-r border-blue-950 pr-[4mm]"><h2 className="rounded-md bg-blue-950 p-2 text-center text-[11px] font-black text-white">HOA OFFICERS</h2><p className="mt-2 text-center text-[9px] font-black text-blue-900">CY 2025-2026</p><div className="mt-4 space-y-4">{organization.slice(0, 8).map((officer, index) => <div className="border-b pb-2" key={String(officer.id || index)}><p className="font-black">{String(officer.fullName || "")}</p><p className="text-[7px] font-bold uppercase text-blue-900">{String(officer.position || "")}</p></div>)}</div><p className="mt-8 text-[8px] leading-4">This certificate is issued upon the request of the above-named individual for whatever legal purpose it may serve.</p></aside>
      <section className="relative"><div className="pointer-events-none absolute left-1/2 top-[52mm] size-[70mm] -translate-x-1/2 opacity-[.05]"><AssociationLogo className="size-full shadow-none ring-0" src={association.logoUrl} alt="" /></div><div className="relative text-center"><h2 className="font-serif text-[27px] font-black tracking-wide text-blue-950">CERTIFICATE OF RESIDENCY</h2><p className="mt-2 font-serif text-[12px] font-black italic text-blue-900">~ TO WHOM IT MAY CONCERN: ~</p></div><div className="relative mx-auto mt-[11mm] max-w-[130mm] text-[12px] leading-[1.55]"><p>This is to certify that</p><p className="my-[5mm] text-[22px] font-black uppercase text-blue-950">{request.homeowner.user.name}</p><p>is a bonafide resident of {association.name}, Brgy. Sabang, Naic, Cavite, and is currently residing at the address indicated below.</p><p className="mt-[5mm]">This certification is based on the records and information on file in this office and is being issued upon the request of the above-named individual for whatever legal purpose it may serve.</p><p className="mt-[5mm]">Issued this {ordinal(issued.getUTCDate())} day of {issued.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} at {association.name} HOA Office, {association.address}.</p></div>
        <div className="relative mt-[8mm] grid grid-cols-2 rounded-xl border border-green-700/60 bg-white/85"><InfoPanel title="PERSONAL INFORMATION" rows={personal} /><InfoPanel title="PROPERTY INFORMATION" rows={property} green /></div></section></div>
    <div className="mt-[6mm] grid grid-cols-[1fr_.8fr_1fr_1fr] gap-5 border-t border-blue-950 pt-[4mm]"><div className="space-y-2"><Pair label="DATE REQUESTED" value={shortDate(request.requestedAt)} /><Pair label="DATE ISSUED" value={shortDate(issued)} /><Pair label="VALID UNTIL" value={shortDate(validUntil)} /></div><div><b>REMARKS</b><p className="mt-3">{request.adminRemarks || request.remarks || "N/A"}</p><div className="mt-8 border-b" /></div><Signature snapshot={request.processedOfficerSnapshot} name={officerName(request.processedOfficerSnapshot, request.processedByOfficer?.fullName || request.processedBy?.name)} label="Processed by" /><Signature snapshot={request.approvedOfficerSnapshot} name={officerName(request.approvedOfficerSnapshot, request.approvedByOfficer?.fullName || request.approvedBy?.name)} label="Approved by" /></div>
    <footer className="mt-[5mm] grid grid-cols-[1fr_1.8fr] rounded-xl border bg-slate-50 p-4 text-[8px]"><div className="font-bold leading-4">This is a system-generated document.<br />No signature required.<br />Scan QR Code to verify authenticity.</div><div className="border-l pl-5"><b className="text-green-700">NOTE:</b><br />This certificate is valid only within the validity date indicated.<br />Any erasure, alteration, or tampering hereon shall invalidate this document.<br />This certificate does not waive any outstanding balance or obligation of the homeowner to the association.</div></footer>
  </article>;
}

function InfoPanel({ title, rows, green = false }: { title: string; rows: string[][]; green?: boolean }) { return <div className="min-w-0 p-4 first:border-r"><h3 className={`text-center text-[10px] font-black ${green ? "text-green-800" : "text-blue-950"}`}>{title}</h3><div className="mt-3 space-y-2">{rows.map(([label, value]) => <Pair key={label} label={label} value={value} />)}</div></div>; }
function Pair({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[34%_1fr] gap-2"><b>{label}</b><span className="break-words">: &nbsp;{value}</span></div>; }

function ClearanceSheet({ request, association, qr }: { request: Request; association: Association; qr: string }) {
  const organization = Array.isArray(request.organizationSnapshot) ? request.organizationSnapshot as Array<Record<string, unknown>> : [];
  return <article className="clearance-sheet official-document-sheet overflow-hidden border border-slate-300 bg-white p-[7mm] text-[10px] text-slate-950">
    <header className="grid grid-cols-[25mm_1fr_35mm] gap-3 border-b-4 border-blue-950 pb-4"><AssociationLogo className="size-[25mm]" src={association.logoUrl} alt={`${association.name} logo`} /><div><h1 className="text-[18px] font-black uppercase leading-tight text-blue-950">{association.name}</h1><p className="mt-2">{association.address}</p><p>{[association.contactNumber, association.email].filter(Boolean).join(" | ")}</p><p className="mt-2">SEC Registration No.: {association.secRegistrationNumber || "Not specified"}</p></div><div className="border-l pl-3"><b>DOCUMENT NO.</b><p className="font-black text-red-600">{request.documentNumber}</p><p className="mt-2"><b>DATE ISSUED</b><br />{shortDate(request.generatedAt!)}</p><img className="mt-2 size-[23mm]" src={qr} alt="Verification QR" /><p className="text-[7px] font-bold">SCAN TO VERIFY</p></div></header>
    <div className="mt-6 grid grid-cols-[42mm_1fr] gap-6"><aside className="border-r border-blue-950 pr-4"><h2 className="rounded-lg bg-blue-950 p-2 text-center font-black text-white">HOA OFFICERS</h2><div className="mt-3 space-y-3">{organization.slice(0, 8).map((officer, index) => <div className="border-b pb-2" key={String(officer.id || index)}><p className="font-black">{String(officer.fullName || "")}</p><p className="text-[8px] font-bold uppercase text-blue-900">{String(officer.position || "")}</p></div>)}</div></aside>
      <section><div className="text-center"><h2 className="font-serif text-[30px] font-black tracking-[.12em] text-blue-950">HOA CLEARANCE</h2><p className="font-serif text-[13px] font-black italic text-blue-900">TO WHOM IT MAY CONCERN:</p></div><div className="mt-8 whitespace-pre-wrap text-justify text-[12px] leading-7">{generatedPlainText(request.generatedContent || "")}</div><div className="mt-8 grid grid-cols-2 gap-5 rounded-2xl border border-green-500 bg-green-50/40 p-4"><Cell label="Homeowner" value={request.homeowner.user.name} /><Cell label="Property" value={request.propertyDetails || `Block ${request.homeowner.block}, Lot ${request.homeowner.lot}, ${request.homeowner.address}`} /><Cell label="Purpose" value={request.purpose || "Official purposes"} /><Cell label="Validity" value={request.validityDate ? shortDate(request.validityDate) : "Not specified"} /></div></section></div>
    <div className="mt-8 grid grid-cols-[1fr_1fr_1fr] gap-8 border-t border-blue-950 pt-6"><div><p><b>DATE REQUESTED:</b> {shortDate(request.requestedAt)}</p><p><b>DATE ISSUED:</b> {shortDate(request.generatedAt!)}</p><p><b>VALID UNTIL:</b> {request.validityDate ? shortDate(request.validityDate) : "Not specified"}</p></div><Signature snapshot={request.processedOfficerSnapshot} name={officerName(request.processedOfficerSnapshot, request.processedByOfficer?.fullName || request.processedBy?.name)} label="Processed by" /><Signature snapshot={request.approvedOfficerSnapshot} name={officerName(request.approvedOfficerSnapshot, request.approvedByOfficer?.fullName || request.approvedBy?.name)} label="Approved by" /></div>
    <footer className="mt-8 rounded-xl border bg-slate-50 p-4 font-bold">This is a system-generated document. Scan the QR code to verify authenticity. This clearance is valid only within the indicated validity period.</footer>
  </article>;
}

function Cell({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={wide ? "col-span-2" : ""}><p className="text-[.8em] font-black uppercase underline">{label}</p><p className="break-words font-bold">{value}</p></div>; }
function Signature({ snapshot, name, label }: { snapshot: unknown; name: string; label: string }) { const url = snapshot && typeof snapshot === "object" && "signatureUrl" in snapshot ? String(snapshot.signatureUrl || "") : ""; return <div className="text-center">{url && <img className="mx-auto h-10 max-w-32 object-contain" src={url} alt={`${name} signature`} />}<div className="border-t pt-1"><b>{name}</b><br /><span>{label}</span></div></div>; }
function officerName(snapshot: unknown, fallback?: string | null) { if (snapshot && typeof snapshot === "object" && "fullName" in snapshot && typeof snapshot.fullName === "string") return snapshot.fullName; return fallback || "Authorized HOA Officer"; }
function documentRequestTitle(request: Request) { return request.definition?.displayName || request.configuration?.displayName || documentTypeLabel(request.type); }
function ordinal(day: number) { const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"; return `${day}${suffix}`; }
function ageAt(birthDate: Date, at: Date) { let age = at.getUTCFullYear() - birthDate.getUTCFullYear(); if (at.getUTCMonth() < birthDate.getUTCMonth() || (at.getUTCMonth() === birthDate.getUTCMonth() && at.getUTCDate() < birthDate.getUTCDate())) age--; return Math.max(0, age); }
function generatedPlainText(value: string) {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value;
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|h1|h2|h3|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
