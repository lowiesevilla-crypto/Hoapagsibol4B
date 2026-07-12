export function AssociationLogo({
  className = "size-12",
  src,
  alt = "Homeowners Association logo",
}: {
  className?: string;
  src?: string | null;
  alt?: string;
}) {
  const logoSrc = src?.trim();

  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-full bg-white shadow-lg ring-2 ring-white/90 ${className}`}>
      {logoSrc ? (
        <img src={logoSrc} alt={alt} className="size-full object-cover object-top" />
      ) : (
        <span aria-label={alt} className="grid size-full place-items-center bg-slate-100 text-xs font-black text-slate-600">HOA</span>
      )}
    </span>
  );
}
