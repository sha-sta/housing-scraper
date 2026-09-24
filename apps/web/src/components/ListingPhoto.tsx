import { useState } from "react";

/**
 * Some photo hosts, the JHU portal's among them, answer 403 to anything that is not a
 * real browser session on their own page. A dead image is worse than no image, so a
 * failed photo falls back to the next one once and then to the placeholder.
 */
export function PhotoPlaceholder({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-surface-2 text-[11px] text-ink-3 ${className}`}
    >
      No photo
    </span>
  );
}

export function ListingPhoto({
  photos,
  className,
  alt = "",
  dim,
}: {
  photos: string[];
  className: string;
  alt?: string;
  dim?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const src = photos[index];

  if (exhausted || !src) return <PhotoPlaceholder className={className} />;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        // One retry with the next photo, then give up rather than walk a whole dead host.
        if (index === 0 && photos.length > 1) setIndex(1);
        else setExhausted(true);
      }}
      className={`shrink-0 bg-surface-2 object-cover ${dim ? "opacity-55" : ""} ${className}`}
    />
  );
}
