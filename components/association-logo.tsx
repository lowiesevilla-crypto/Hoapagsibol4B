import { DEFAULT_TENANT_LOGO_URL } from "@/lib/tenant-logo";

export function AssociationLogo({ className = "size-12", src = DEFAULT_TENANT_LOGO_URL, alt = "Homeowners Association logo" }: { className?: string; src?: string | null; alt?: string }) {
  const logoSrc = src?.trim() || DEFAULT_TENANT_LOGO_URL;
  return <span className={`relative block shrink-0 overflow-hidden rounded-full bg-white shadow-lg ring-2 ring-white/90 ${className}`}>
    <img src={logoSrc} alt={alt} className="size-full object-cover object-top" />
  </span>;
}
