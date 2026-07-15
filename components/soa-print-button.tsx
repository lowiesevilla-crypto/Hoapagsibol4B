"use client";

import { Printer } from "lucide-react";
import type { KeyboardEvent } from "react";

export function SoaPrintButton() {
  const handleKeyboardPrint = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    window.print();
  };

  return (
    <button
      type="button"
      className="btn-primary print-hidden cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-700 active:translate-y-0 active:shadow-none"
      onClick={() => window.print()}
      onKeyDown={handleKeyboardPrint}
    >
      <Printer className="size-4" />
      Print SOA
    </button>
  );
}
