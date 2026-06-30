"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return <button type="button" className="btn-primary print-hidden" onClick={() => window.print()}><Printer className="size-4" />{label}</button>;
}
