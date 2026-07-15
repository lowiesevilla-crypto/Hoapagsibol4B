"use client";

import { useEffect } from "react";

export function PaginationFocusTarget({ id, label }: { id: string; label: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    focusPaginationTarget(id);
  }, [id]);

  return <span id={id} tabIndex={-1} className="block h-0 scroll-mt-4 outline-none" aria-label={label} />;
}

export function focusPaginationTarget(id: string) {
  window.requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "auto" });
    target.focus({ preventScroll: true });
  });
}
