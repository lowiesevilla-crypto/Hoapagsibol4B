"use client";

import { ReceiptPreviewError } from "@/components/receipt-preview-error";

export default function BondRefundReceiptError({ reset }: { reset: () => void }) {
  return <ReceiptPreviewError reset={reset} historyHref="/admin/collections" historyLabel="Collections and refunds" />;
}
