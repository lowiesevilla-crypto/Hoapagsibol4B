"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { isSeasonalSantaWindow, SEASONAL_SANTA_LOGIN_COOKIE, SEASONAL_SANTA_LOGIN_KEY, seasonalSantaSessionKey, wasSeasonalSantaShownForLogin } from "@/lib/seasonal-santa";
import styles from "./seasonal-santa-greeting.module.css";

const AUTO_DISMISS_MS = 6_500;
const LOGIN_SIGNAL_MAX_AGE_MS = 30_000;

function cookieLoginAt(tenantId: string): number {
  const value = document.cookie.split("; ").find((item) => item.startsWith(`${SEASONAL_SANTA_LOGIN_COOKIE}=`))?.split("=")[1];
  const [signalTenantId, rawLoginAt] = decodeURIComponent(value || "").split(".");
  return signalTenantId === tenantId ? Number(rawLoginAt) : 0;
}

export function SeasonalSantaGreeting({ tenantId, associationName, logoUrl }: { tenantId: string; associationName: string; logoUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const key = seasonalSantaSessionKey(tenantId);
      const authenticatedAt = Number(window.sessionStorage.getItem(SEASONAL_SANTA_LOGIN_KEY)) || cookieLoginAt(tenantId);
      const isFreshLogin = Number.isFinite(authenticatedAt) && authenticatedAt > 0 && Date.now() - authenticatedAt <= LOGIN_SIGNAL_MAX_AGE_MS;
      if (!isFreshLogin || !isSeasonalSantaWindow(new Date()) || wasSeasonalSantaShownForLogin(window.sessionStorage.getItem(key), authenticatedAt)) return;
      window.sessionStorage.setItem(key, String(authenticatedAt));
      document.cookie = `${SEASONAL_SANTA_LOGIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    } catch { /* Storage restrictions must never affect authenticated navigation. */ }
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      previousFocusRef.current?.focus();
      return;
    }
    closeButtonRef.current?.focus();
  }, [open]);

  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  if (!open) return null;
  const safeLogo = logoUrl?.trim() || "/Hoahub-logo.png";
  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={trapFocus}>
    <section className={styles.card}>
      <button ref={closeButtonRef} type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close seasonal greeting"><X aria-hidden="true" /></button>
      <div className={styles.santa} aria-hidden="true"><div className={styles.head}>🎅</div><div className={styles.gift}><img className={styles.logo} src={safeLogo} alt="" /></div></div>
      <p className={styles.eyebrow}>Seasonal greeting</p>
      <h2 id={titleId} className={styles.title}>Welcome to {associationName}!</h2>
      <p id={descriptionId} className={styles.copy}>Santa is bringing warm holiday wishes from your association. Have a joyful and safe season!</p>
      <button type="button" className={styles.skip} onClick={() => setOpen(false)}>Skip greeting</button>
    </section>
  </div>;
}
