"use client";

import { Printer } from "lucide-react";

export function PayrollReportPrintButton() {
  return <button className="btn-secondary print:hidden" type="button" onClick={() => window.print()}>
    <Printer className="size-4" /> Print report
  </button>;
}
