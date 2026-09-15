export type AiBusinessIntent =
  | "RESIDENT_PRIVACY_DENY"
  | "RESIDENT_OPERATIONAL"
  | "STAFF_EXISTING_OPERATIONAL"
  | "STAFF_TENANT_PROFILE"
  | "STAFF_ORGANIZATION"
  | "STAFF_HOMEOWNERS"
  | "STAFF_PAYMENTS"
  | "STAFF_RECEIVABLES"
  | "STAFF_DOCUMENT_REQUESTS"
  | "STAFF_COMPLAINTS"
  | "STAFF_PAYROLL"
  | "STAFF_ATTENDANCE"
  | "STAFF_EMPLOYEES"
  | "STAFF_COMMUNITY";

type Experience = "RESIDENT" | "STAFF";

const KNOWLEDGE_TERMS = /\b(policy|policies|rule|rules|bylaw|bylaws|by-laws|resolution|section|sec\.?|manual|guideline|procedure|ordinance|magna carta|declaration|governance|brd|knowledge document|knowledge source)\b/i;
const RESIDENT_DIRECTORY_REQUEST = /\b(list|show|give|provide|display|all|directory|names?|who are)\b.{0,90}\b(homeowners?|home owners?|residents?|members?)\b|\b(homeowners?|home owners?|residents?|members?)\b.{0,90}\b(list|directory|names?|all)\b/i;
const OTHER_RESIDENT_PRIVATE = /\b(another|other|neighbor|neighbour|someone else|different homeowner|other homeowner|other resident)\b.{0,100}\b(balance|account|dues|profile|address|phone|email|payment|receipt|transaction|property)\b/i;
const ORGANIZATION_TERMS = /\b(president|vice president|secretary|treasurer|auditor|officer|officers|board|director|directors|committee|organization|organisation|hoa leadership|association leadership)\b/i;
const RESIDENT_OWN_RECORD_TERMS = /\b(my|own|mine|ako|ko)\b.{0,90}\b(balance|billing|bill|dues|payment|payments|transaction|transactions|receipt|receipts|account|profile|property|block|lot|address|request|requests|complaint|complaints|collection|bond|refund|statement of account|soa)\b|\b(balance|billing|bills|dues|payment history|transaction history|receipt|account number|statement of account|soa)\b/i;
const COMMUNITY_TERMS = /\b(announcement|announcements|notice|notices|event|events|meeting|meetings|activity|activities|calendar|schedule|community update|community updates)\b/i;
const DOCUMENT_SERVICE_TERMS = /\b(document request|document requests|certificate|clearance|gate pass|move[- ]?in|move[- ]?out|requirements?|how to request|request status)\b/i;

function hasOperationalStaffTerm(value: string) {
  return /\b(homeowners?|home owners?|residents?|members?|payment|payments|transactions?|receipts?|billing|bills?|receivables?|outstanding|overdue|collections?|finance|financial|expenses?|document requests?|complaints?|payroll|attendance|employees?|staff|officers?|president|treasurer|secretary|announcements?|events?|tenant|association profile|hoa profile)\b/i.test(value);
}

export function classifyAiBusinessIntent(experience: Experience, question: unknown): AiBusinessIntent | null {
  if (typeof question !== "string") return null;
  const value = question.trim();
  if (!value) return null;

  if (experience === "RESIDENT") {
    if (RESIDENT_DIRECTORY_REQUEST.test(value) || OTHER_RESIDENT_PRIVATE.test(value)) return "RESIDENT_PRIVACY_DENY";
    if (ORGANIZATION_TERMS.test(value)) return "RESIDENT_OPERATIONAL";
    if (RESIDENT_OWN_RECORD_TERMS.test(value)) return "RESIDENT_OPERATIONAL";
    if (COMMUNITY_TERMS.test(value)) return "RESIDENT_OPERATIONAL";
    if (DOCUMENT_SERVICE_TERMS.test(value) && !KNOWLEDGE_TERMS.test(value)) return "RESIDENT_OPERATIONAL";
    if (/\b(who are you|what can you do|help me|hello|hi|hey|thank you|thanks|salamat|joke)\b/i.test(value)) return "RESIDENT_OPERATIONAL";
    return null;
  }

  const knowledgeOnly = KNOWLEDGE_TERMS.test(value) && !hasOperationalStaffTerm(value);
  if (knowledgeOnly) return null;

  if (/\b(tenant|association|hoa)\b.{0,80}\b(profile|information|details|contact|address|subscription|status|timezone|currency)\b|\bwhat (association|hoa) is this\b/i.test(value)) return "STAFF_TENANT_PROFILE";
  if (ORGANIZATION_TERMS.test(value)) return "STAFF_ORGANIZATION";
  if (/\b(homeowners?|home owners?|residents?|members?|homeowner directory|resident directory)\b/i.test(value)) return "STAFF_HOMEOWNERS";
  if (/\b(payment|payments|payment history|transactions?|transaction history|receipts?|official receipt|or number|gcash|cash|bank transfer|check)\b/i.test(value)) return "STAFF_PAYMENTS";
  if (/\b(receivables?|outstanding|overdue|unpaid|arrears?|balances?|billing|bills?|amount due)\b/i.test(value)) return "STAFF_RECEIVABLES";
  if (/\b(document requests?|pending documents?|certificate requests?|gate pass requests?|move[- ]?in requests?|move[- ]?out requests?)\b/i.test(value)) return "STAFF_DOCUMENT_REQUESTS";
  if (/\b(complaints?|grievances?|incidents?|concerns?)\b/i.test(value)) return "STAFF_COMPLAINTS";
  if (/\b(payroll|pay run|payroll run|payslips?|salary processing|pay period)\b/i.test(value)) return "STAFF_PAYROLL";
  if (/\b(attendance|absent|absences|present employees?|late employees?|undertime|time in|time out)\b/i.test(value)) return "STAFF_ATTENDANCE";
  if (/\b(employees?|employee directory|staff roster|workforce)\b/i.test(value)) return "STAFF_EMPLOYEES";
  if (COMMUNITY_TERMS.test(value)) return "STAFF_COMMUNITY";
  if (/\b(total collection today|today'?s collections?|finance summary|financial summary|cash flow|income|expenses?|net collection|draft\s+(a\s+)?(board\s+)?resolution|what can you do|staff copilot|admin assistant|joke)\b/i.test(value)) return "STAFF_EXISTING_OPERATIONAL";
  return null;
}
