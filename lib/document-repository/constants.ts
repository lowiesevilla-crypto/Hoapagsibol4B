export const repositoryDocumentVisibility = ["INTERNAL", "TENANT_PUBLIC", "RESTRICTED"] as const;
export type RepositoryDocumentVisibility = (typeof repositoryDocumentVisibility)[number];

export const repositoryDocumentStatus = ["DRAFT", "PUBLISHED", "INACTIVE", "ARCHIVED"] as const;
export type RepositoryDocumentStatus = (typeof repositoryDocumentStatus)[number];

export const repositoryRevisionPolicy = ["REPLACE_CURRENT", "KEEP_HISTORY"] as const;
export type RepositoryRevisionPolicy = (typeof repositoryRevisionPolicy)[number];

export const repositoryMalwareScanStatus = ["NOT_CONFIGURED", "PENDING", "PASSED", "FAILED", "BLOCKED"] as const;
export type RepositoryMalwareScanStatus = (typeof repositoryMalwareScanStatus)[number];

export const DOCUMENT_MANAGEMENT_FEATURE_CODE = "DOCUMENT_MANAGEMENT" as const;

export const REPOSITORY_AUDIT_MODULE = "DOCUMENT_MANAGEMENT" as const;

export const RepositoryAuditAction = {
  UPLOADED: "DOCUMENT_REPOSITORY_UPLOADED",
  METADATA_UPDATED: "DOCUMENT_REPOSITORY_METADATA_UPDATED",
  STATUS_CHANGED: "DOCUMENT_REPOSITORY_STATUS_CHANGED",
  VISIBILITY_CHANGED: "DOCUMENT_REPOSITORY_VISIBILITY_CHANGED",
  PUBLISHED: "DOCUMENT_REPOSITORY_PUBLISHED",
  UNPUBLISHED: "DOCUMENT_REPOSITORY_UNPUBLISHED",
  DOWNLOADED: "DOCUMENT_REPOSITORY_DOWNLOADED",
  REPLACED: "DOCUMENT_REPOSITORY_REPLACED",
  REVISION_CREATED: "DOCUMENT_REPOSITORY_REVISION_CREATED",
  REVISION_BINARY_PURGED: "DOCUMENT_REPOSITORY_REVISION_BINARY_PURGED",
  ARCHIVED: "DOCUMENT_REPOSITORY_ARCHIVED",
  DELETED: "DOCUMENT_REPOSITORY_DELETED",
  CATEGORY_CREATED: "DOCUMENT_REPOSITORY_CATEGORY_CREATED",
  CATEGORY_UPDATED: "DOCUMENT_REPOSITORY_CATEGORY_UPDATED",
  CATEGORY_DELETED: "DOCUMENT_REPOSITORY_CATEGORY_DELETED",
} as const;

export type RepositoryAuditAction = (typeof RepositoryAuditAction)[keyof typeof RepositoryAuditAction];

export type RepositoryDefaultCategory = {
  code: string;
  name: string;
  group: string;
  governed: boolean;
  sortOrder: number;
};

export const repositoryDefaultCategories: readonly RepositoryDefaultCategory[] = Object.freeze([
  { code: "BYLAWS", name: "Bylaws", group: "GOVERNANCE", governed: true, sortOrder: 10 },
  { code: "RESOLUTIONS", name: "Board / HOA Resolutions", group: "GOVERNANCE", governed: true, sortOrder: 20 },
  { code: "MEETING_MINUTES", name: "Meeting Minutes", group: "GOVERNANCE", governed: true, sortOrder: 30 },
  { code: "POLICIES_GUIDELINES", name: "Policies and Guidelines", group: "POLICY", governed: true, sortOrder: 40 },
  { code: "MEMORANDA", name: "Memoranda", group: "COMMUNICATION", governed: true, sortOrder: 50 },
  { code: "CIRCULARS_ADVISORIES", name: "Circulars and Advisories", group: "COMMUNICATION", governed: false, sortOrder: 60 },
  { code: "FORMS_TEMPLATES", name: "Forms and Templates", group: "ADMIN", governed: false, sortOrder: 70 },
  { code: "GOVERNMENT_REGULATORY", name: "Government / Regulatory Documents", group: "COMPLIANCE", governed: true, sortOrder: 80 },
  { code: "PERMITS_LICENSES", name: "Permits and Licenses", group: "COMPLIANCE", governed: true, sortOrder: 90 },
  { code: "FINANCIAL_REPORTS", name: "Financial Reports", group: "FINANCE", governed: true, sortOrder: 100 },
  { code: "COMMUNITY_RULES", name: "Community Rules", group: "COMMUNITY", governed: true, sortOrder: 110 },
  { code: "FACILITY_RULES", name: "Facility Rules", group: "FACILITIES", governed: true, sortOrder: 120 },
  { code: "SECURITY_GUIDELINES", name: "Security Guidelines", group: "SECURITY", governed: true, sortOrder: 130 },
  { code: "COMMITTEE_RECORDS", name: "Committee Records", group: "COMMITTEE", governed: false, sortOrder: 140 },
  { code: "CONTRACTS_VENDOR", name: "Contracts / Vendor Documents", group: "ADMIN", governed: true, sortOrder: 150 },
  { code: "OTHER", name: "Other Documents", group: "OTHER", governed: false, sortOrder: 999 },
]);

export const REPOSITORY_DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const REPOSITORY_QUOTA_WARNING_THRESHOLDS = [0.8, 0.9, 1] as const;
