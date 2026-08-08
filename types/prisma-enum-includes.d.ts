import type {
  AgreementTemplateVersionStatus,
  PlatformGatewayEventStatus,
  PlatformInvoiceStatus,
  Role,
  TenantAgreementStatus,
  TenantSubscriptionStatus,
} from "@prisma/client";

type HoaHubEnum =
  | AgreementTemplateVersionStatus
  | PlatformGatewayEventStatus
  | PlatformInvoiceStatus
  | Role
  | TenantAgreementStatus
  | TenantSubscriptionStatus;

type HoaHubEnumIncludeSearch<T> = T extends HoaHubEnum ? HoaHubEnum : T;

declare global {
  interface Array<T> {
    includes(searchElement: HoaHubEnumIncludeSearch<T>, fromIndex?: number): boolean;
  }

  interface ReadonlyArray<T> {
    includes(searchElement: HoaHubEnumIncludeSearch<T>, fromIndex?: number): boolean;
  }
}

export {};
