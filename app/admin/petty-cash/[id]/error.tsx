"use client";

import { ReceiptPreviewError } from "@/components/receipt-preview-error";

export default function VoucherError({ reset }: { reset: () => void }) {
  return <ReceiptPreviewError reset={reset} historyHref="/admin/petty-cash" historyLabel="Voucher register" />;
}
