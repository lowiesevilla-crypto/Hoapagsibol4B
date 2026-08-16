"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";

export function HomeownerAvatar({
  name,
  src,
  className = "size-11",
  imageClassName = "",
  showFallbackIcon = false,
}: {
  name: string;
  src?: string | null;
  className?: string;
  imageClassName?: string;
  showFallbackIcon?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "H";

  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-pine-700 to-leaf-500 font-black text-white shadow-sm ring-1 ring-black/5 ${className}`} aria-label={`${name} profile photo`}>
      {showFallbackIcon ? <UserRound className="size-[46%]" aria-hidden="true" /> : <span aria-hidden="true">{initials}</span>}
      {src && !failed && (
        <img
          src={src}
          alt=""
          className={`absolute inset-0 size-full object-cover ${imageClassName}`}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
