export function AssociationLogo({ className = "size-12", src = "/pagsibol-logo.png", alt = "Homeowners Association logo" }: { className?: string; src?: string; alt?: string }) {
  return <span className={`relative block shrink-0 overflow-hidden rounded-full bg-white shadow-lg ring-2 ring-white/90 ${className}`}>
    <img src={src || "/pagsibol-logo.png"} alt={alt} className="size-full object-cover object-top" />
  </span>;
}
