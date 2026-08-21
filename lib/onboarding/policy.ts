export const TENANT_ONBOARDING_VERSION = 1 as const;

export type OnboardingImportError = {
  rowNumber: number | null;
  field: string | null;
  message: string;
};

export type TenantOnboardingState = {
  version: typeof TENANT_ONBOARDING_VERSION;
  updatedAt: string;
  profile?: {
    completedAt: string;
    timezone: string;
    currency: string;
    supportEmail: string | null;
    supportPhone: string | null;
    receiptPrefix: string;
    documentPrefix: string;
  };
  privacy?: {
    acknowledgedAt: string;
    acknowledgedById: string;
    dataControllerAccepted: boolean;
    secureHandlingAccepted: boolean;
    importAuthorizationAccepted: boolean;
  };
  import?: {
    templateVersion: string;
    fileHash: string;
    fileName: string;
    validatedAt: string;
    validRows: number;
    errors: OnboardingImportError[];
    appliedAt?: string;
    lastAppliedAt?: string;
    importedRows?: number;
    openingBalancesPosted?: number;
    batchesApplied?: number;
    lastBatchImportedRows?: number;
    lastBatchOpeningBalancesPosted?: number;
    currentBatchApplied?: boolean;
  };
  billing?: {
    completedAt: string;
    ruleId: string;
    monthlyAmount: number;
    effectiveFrom: string;
    dueDay: number;
    description: string;
  };
  preview?: {
    completedAt: string;
    year: number;
    month: number;
    eligible: number;
    skipped: number;
    errors: number;
    totalAmount: number;
    confirmationRequired: true;
  };
  completedAt?: string;
  completedById?: string;
};

export function emptyTenantOnboardingState(): TenantOnboardingState {
  return { version: TENANT_ONBOARDING_VERSION, updatedAt: new Date(0).toISOString() };
}

export function currentOnboardingImportIsApplied(state: TenantOnboardingState) {
  return Boolean(state.import?.appliedAt) && state.import?.currentBatchApplied !== false;
}

export function onboardingPrerequisites(state: TenantOnboardingState) {
  return {
    profile: Boolean(state.profile),
    privacy: Boolean(
      state.privacy?.dataControllerAccepted &&
      state.privacy.secureHandlingAccepted &&
      state.privacy.importAuthorizationAccepted,
    ),
    import: currentOnboardingImportIsApplied(state),
    billing: Boolean(state.billing),
    preview: Boolean(state.preview),
  };
}
