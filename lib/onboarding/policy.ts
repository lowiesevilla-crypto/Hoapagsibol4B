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
    locale: string;
    currency: string;
    logoUrl: string | null;
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
    importedRows?: number;
    openingBalancesPosted?: number;
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

export function onboardingPrerequisites(state: TenantOnboardingState) {
  return {
    profile: Boolean(state.profile),
    privacy: Boolean(
      state.privacy?.dataControllerAccepted &&
      state.privacy.secureHandlingAccepted &&
      state.privacy.importAuthorizationAccepted,
    ),
    import: Boolean(state.import?.appliedAt),
    billing: Boolean(state.billing),
    preview: Boolean(state.preview),
  };
}
