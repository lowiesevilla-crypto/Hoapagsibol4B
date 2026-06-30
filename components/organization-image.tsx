"use client";

import { useEffect, useState } from "react";

export function OrganizationImage({ src, alt, className, fallback }: { src?: string | null; alt: string; className: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
