export type AiExperience = "RESIDENT" | "STAFF";

export type AiGovernanceSnapshot = {
  runtimeEnabled: boolean;
  residentAssistantEnabled: boolean;
  staffCopilotEnabled: boolean;
  boardApprovedAt: Date | null;
  piaApprovedAt: Date | null;
  dpoApprovedAt: Date | null;
  providerApprovedAt: Date | null;
  crossBorderReviewApprovedAt: Date | null;
  privacyNoticeVersion: string | null;
  privacyNoticePublishedAt: Date | null;
  lawfulBasis: string | null;
  retentionDays: number;
};

export function evaluateAiGovernance(input: {
  globalRuntimeEnabled: boolean;
  commerciallyEnabled: boolean;
  experience: AiExperience;
  governance: AiGovernanceSnapshot | null;
}) {
  if (!input.globalRuntimeEnabled) return { allowed: false as const, reason: "GLOBAL_AI_KILL_SWITCH" };
  if (!input.commerciallyEnabled) return { allowed: false as const, reason: "AI_NOT_ENTITLED" };
  const governance = input.governance;
  if (!governance?.runtimeEnabled) return { allowed: false as const, reason: "TENANT_AI_DISABLED" };
  if (!governance.boardApprovedAt) return { allowed: false as const, reason: "BOARD_APPROVAL_REQUIRED" };
  if (!governance.piaApprovedAt) return { allowed: false as const, reason: "PIA_APPROVAL_REQUIRED" };
  if (!governance.dpoApprovedAt) return { allowed: false as const, reason: "DPO_APPROVAL_REQUIRED" };
  if (!governance.providerApprovedAt) return { allowed: false as const, reason: "PROVIDER_APPROVAL_REQUIRED" };
  if (!governance.crossBorderReviewApprovedAt) return { allowed: false as const, reason: "CROSS_BORDER_REVIEW_REQUIRED" };
  if (!governance.privacyNoticePublishedAt || !governance.privacyNoticeVersion) return { allowed: false as const, reason: "PRIVACY_NOTICE_REQUIRED" };
  if (!governance.lawfulBasis) return { allowed: false as const, reason: "LAWFUL_BASIS_REQUIRED" };
  if (!Number.isSafeInteger(governance.retentionDays) || governance.retentionDays < 1) return { allowed: false as const, reason: "RETENTION_POLICY_REQUIRED" };
  if (input.experience === "RESIDENT" && !governance.residentAssistantEnabled) return { allowed: false as const, reason: "RESIDENT_AI_DISABLED" };
  if (input.experience === "STAFF" && !governance.staffCopilotEnabled) return { allowed: false as const, reason: "STAFF_AI_DISABLED" };
  return { allowed: true as const, reason: null };
}
