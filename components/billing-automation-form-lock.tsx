"use client";

import { useEffect, useRef, useState } from "react";

type AutomationStatus = {
  automatic: boolean;
  billingDay: number | null;
  effectiveStartYear?: number | null;
  effectiveStartMonth?: number | null;
};

export function BillingAutomationFormLock({
  scope = "form",
  updateSectionDescription = false,
}: {
  scope?: "form" | "section";
  updateSectionDescription?: boolean;
}) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const marker = markerRef.current;
    // Billing generation was moved under a collapsible <details> container. The
    // old section-only lookup silently found no target, leaving manual controls
    // enabled. Fall back to the containing form so the safety lock survives
    // presentation/layout refactors.
    const target = scope === "section"
      ? marker?.closest("section") ?? marker?.closest("form")
      : marker?.closest("form");
    if (!target) return;

    let locked = true;
    const description = updateSectionDescription ? target.querySelector("h2")?.parentElement?.querySelector("p") : null;
    const originalDescription = description?.textContent ?? "";
    const generatedIds: HTMLElement[] = [];
    const boundLabels: HTMLLabelElement[] = [];
    const boundAriaLabels: HTMLElement[] = [];

    const bindAccessibleLabels = () => {
      if (!(scope === "section" && updateSectionDescription)) return;

      document.querySelectorAll<HTMLLabelElement>("label").forEach((label, index) => {
        if (label.htmlFor || label.querySelector("input, select, textarea")) return;
        const parent = label.parentElement;
        if (!parent) return;

        const labelText = (label.textContent || "").replace(/\s+/g, " ").trim();
        if (!labelText) return;

        const controls = Array.from(parent.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not([type='hidden']), select, textarea"))
          .filter((control) => !control.getAttribute("aria-labelledby") && !control.getAttribute("aria-label"));
        if (!controls.length) return;

        const searchControl = controls.find((control) => control instanceof HTMLInputElement && control.type === "search");
        const primaryControl = controls.find((control) => control !== searchControl) ?? controls[0];

        if (searchControl && searchControl !== primaryControl && !searchControl.getAttribute("aria-label")) {
          searchControl.setAttribute("aria-label", `Search ${labelText}`);
          boundAriaLabels.push(searchControl);
        }

        if (!primaryControl.id) {
          primaryControl.id = `billing-accessibility-control-${index}`;
          generatedIds.push(primaryControl);
        }
        label.htmlFor = primaryControl.id;
        boundLabels.push(label);
      });
    };

    bindAccessibleLabels();

    const lockControls = () => {
      target.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("input:not([type='hidden']), select, textarea, button").forEach((control) => {
        if (!control.disabled) {
          control.dataset.autoBillingLocked = "true";
          control.disabled = true;
        }
      });
    };
    const unlockControls = () => {
      target.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("[data-auto-billing-locked='true']").forEach((control) => {
        control.disabled = false;
        delete control.dataset.autoBillingLocked;
      });
    };
    const blockSubmit = (event: Event) => {
      if (!locked) return;
      event.preventDefault();
      event.stopPropagation();
    };

    // Fail closed while HOAHub verifies the tenant's automation status.
    lockControls();
    target.addEventListener("submit", blockSubmit, true);

    const controller = new AbortController();
    fetch("/api/admin/billing/automation-status", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Automatic billing status could not be verified.");
        return response.json() as Promise<AutomationStatus>;
      })
      .then((payload) => {
        setStatus(payload);
        setError("");
        locked = payload.automatic;
        if (!payload.automatic) unlockControls();
        if (description) {
          description.textContent = payload.automatic
            ? "Automatic billing is ON. HOAHub owns this monthly cycle, so manual generation is locked to prevent duplicate or partial billing."
            : "Preview first, then generate tenant-scoped monthly dues from the effective Billing Rule. Automatic billing is currently OFF.";
        }
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        locked = true;
        lockControls();
        setError(fetchError instanceof Error ? fetchError.message : "Automatic billing status could not be verified.");
        if (description) description.textContent = "Automatic billing status could not be verified. Manual generation is locked for safety.";
      });

    return () => {
      controller.abort();
      target.removeEventListener("submit", blockSubmit, true);
      unlockControls();
      if (description && originalDescription) description.textContent = originalDescription;
      boundLabels.forEach((label) => label.removeAttribute("for"));
      boundAriaLabels.forEach((control) => control.removeAttribute("aria-label"));
      generatedIds.forEach((control) => control.removeAttribute("id"));
    };
  }, [scope, updateSectionDescription]);

  return <>
    <div ref={markerRef} className="hidden" aria-hidden="true" />
    {status?.automatic && <div role="status" className="md:col-span-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-900">
      <p className="font-black">Automatic billing is ON · Manual generation disabled</p>
      <p className="mt-1">HOAHub owns automatic Monthly Dues generation{status.billingDay ? ` on day ${status.billingDay}` : " on the configured billing day"}. Existing bills for the same homeowner and coverage month are skipped. Turn Automatic Billing OFF in Billing Rules before using manual generation.</p>
    </div>}
    {error && <div role="alert" className="md:col-span-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
      <p className="font-black">Manual generation temporarily locked</p>
      <p className="mt-1">{error} HOAHub is keeping manual billing disabled until the automation state can be confirmed.</p>
    </div>}
  </>;
}
