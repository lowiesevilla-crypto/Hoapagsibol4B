"use client";

import { Printer } from "lucide-react";

/**
 * @requirement PAY-RPT-001
 * @status IMPLEMENTED
 */
export function PayrollReportPrintButton() {
  return <button className="btn-secondary print:hidden" type="button" onClick={() => window.print()}>
    <Printer className="size-4" /> Print report
  </button>;
}
