"use client";

import { ReceiptPreviewError } from "@/components/receipt-preview-error";

export default function ReceiptError({ reset }: { reset: () => void }) {
  return <ReceiptPreviewError reset={reset} />;
}
