"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./post-login-brand-orbit.module.css";

export const LOGIN_HANDOFF_STORAGE_KEY = "hoahub.login.handoff.v1";
const LOGIN_HANDOFF_MAX_AGE_MS = 10_000;
const LOGIN_HANDOFF_VISIBLE_MS = 1_700;

export function PostLoginBrandOrbit({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    try {
      const raw = window.sessionStorage.getItem(LOGIN_HANDOFF_STORAGE_KEY);
      const authenticatedAt = raw ? Number(raw) : 0;
      const fresh = Number.isFinite(authenticatedAt) && authenticatedAt > 0 && Date.now() - authenticatedAt <= LOGIN_HANDOFF_MAX_AGE_MS;
      if (!fresh) return;

      setActive(true);
      timer = window.setTimeout(() => {
        setActive(false);
        try {
          window.sessionStorage.removeItem(LOGIN_HANDOFF_STORAGE_KEY);
        } catch { /* The one-shot animation can expire naturally if storage is unavailable. */ }
      }, LOGIN_HANDOFF_VISIBLE_MS);
    } catch { /* Storage restrictions must never affect authenticated navigation. */ }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <span className={`${styles.orbit} ${active ? styles.active : ""} ${className}`} data-login-handoff={active ? "active" : "idle"}>
      {children}
      <span className={styles.signal} aria-hidden="true" />
    </span>
  );
}
