import type {
  PlatformGatewayEventStatus,
  PlatformInvoiceStatus,
  TenantSubscriptionStatus,
} from "@prisma/client";

type HoaHubEnumIncludeSearch<T> =
  T extends PlatformInvoiceStatus ? PlatformInvoiceStatus
  : T extends TenantSubscriptionStatus ? TenantSubscriptionStatus
  : T extends PlatformGatewayEventStatus ? PlatformGatewayEventStatus
  : T;

declare global {
  interface Array<T> {
    includes(searchElement: HoaHubEnumIncludeSearch<T>, fromIndex?: number): boolean;
  }

  interface ReadonlyArray<T> {
    includes(searchElement: HoaHubEnumIncludeSearch<T>, fromIndex?: number): boolean;
  }
}

export {};
