export const PETTY_CASH_FEATURE_CODE = "PETTY_CASH_VOUCHER";
export const PETTY_CASH_FEATURE_LABEL = "Petty Cash Voucher";
export const PETTY_CASH_SEQUENCE_SCOPE = "PETTY_CASH_VOUCHER";

export const PETTY_CASH_PAYEE_TYPES = ["EMPLOYEE", "HOMEOWNER", "RENTER", "CONTRACTOR", "OTHER"] as const;
export type PettyCashPayeeType = (typeof PETTY_CASH_PAYEE_TYPES)[number];

export const PETTY_CASH_APPROVER_TYPES = ["ADMIN", "OFFICER"] as const;
export type PettyCashApproverType = (typeof PETTY_CASH_APPROVER_TYPES)[number];
