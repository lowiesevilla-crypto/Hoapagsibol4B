"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { LOGIN_HANDOFF_STORAGE_KEY } from "@/components/post-login-brand-orbit";
import { isSeasonalSantaWindow, seasonalSantaSessionKey } from "@/lib/seasonal-santa";
import styles from "./seasonal-santa-greeting.module.css";

const AUTO_DISMISS_MS = 6_500;
const LOGIN_HANDOFF_MAX_AGE_MS = 10_000;

export function SeasonalSantaGreeting({ tenantId, associationName, logoUrl }: { tenantId: string; associationName: string; logoUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    try {
      const key = seasonalSantaSessionKey(tenantId);
      const authenticatedAt = Number(window.sessionStorage.getItem(LOGIN_HANDOFF_STORAGE_KEY));
      const isFreshLogin = Number.isFinite(authenticatedAt) && authenticatedAt > 0 && Date.now() - authenticatedAt <= LOGIN_HANDOFF_MAX_AGE_MS;
      if (!isFreshLogin || !isSeasonalSantaWindow(new Date()) || window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "shown");
      setOpen(true);
    } catch { /* Storage restrictions must never affect authenticated navigation. */ }
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;
  const safeLogo = logoUrl?.trim() || "/Hoahub-logo.png";
  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <section className={styles.card}>
      <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close seasonal greeting"><X aria-hidden="true" /></button>
      <div className={styles.santa} aria-hidden="true"><div className={styles.head}>🎅</div><div className={styles.gift}><img className={styles.logo} src={safeLogo} alt="" /></div></div>
      <p className={styles.eyebrow}>Seasonal greeting</p>
      <h2 id={titleId} className={styles.title}>Welcome to {associationName}!</h2>
      <p id={descriptionId} className={styles.copy}>Santa is bringing warm holiday wishes from your association. Have a joyful and safe season!</p>
      <button type="button" className={styles.skip} onClick={() => setOpen(false)}>Skip greeting</button>
    </section>
  </div>;
}
