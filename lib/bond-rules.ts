import { CollectionType, RefundStatus } from "@prisma/client";

const refundableBondTypes = new Set<CollectionType>([
  CollectionType.CONSTRUCTION_BOND,
  CollectionType.CONTRACTOR_BOND,
]);

export function isRefundableBondType(type: CollectionType) {
  return refundableBondTypes.has(type);
}

export function effectiveBondRefundStatus(type: CollectionType, status: RefundStatus) {
  if (isRefundableBondType(type) && status === RefundStatus.NOT_APPLICABLE) {
    return RefundStatus.HELD;
  }
  return status;
}
