/** A photo served behind sign-in, or the person's initials when there's no photo. */
export function Avatar({ fileId, name, className = "size-14 text-lg", alt = "" }: { fileId: string | null; name: string; className?: string; alt?: string }) {
  if (fileId) {
    // Served behind sign-in, so it can't go through the image optimiser.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/household/files/${fileId}`} alt={alt} className={`shrink-0 object-cover ${className}`} />;
  }
  const initials = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span aria-hidden className={`bg-gradient-accent flex shrink-0 items-center justify-center font-display font-semibold text-on-accent ${className}`}>
      {initials}
    </span>
  );
}
