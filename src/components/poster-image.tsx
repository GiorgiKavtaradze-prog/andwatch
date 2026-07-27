import { Clapperboard } from "lucide-react";
import Image from "next/image";
import { posterUrl } from "@/lib/tmdb/attribution";
import { cn } from "@/lib/utils";

export interface PosterImageProps {
  posterPath: string | null;
  title: string;
  /** TMDB image size (w200/w300/w500/original). */
  size?: string;
  className?: string;
  /** Responsive `sizes` hint forwarded to next/image. */
  sizes?: string;
}

/**
 * Movie art at the 2:3 poster ratio. Renders the TMDB poster when a path exists,
 * or a designed fallback (surface gradient, faint film-frame watermark, title in
 * Fraunces) when it is null — never a broken image. Server-safe.
 */
export function PosterImage({
  posterPath,
  title,
  size = "w500",
  className,
  sizes = "(max-width: 640px) 45vw, 220px",
}: PosterImageProps) {
  const url = posterUrl(posterPath, size);

  return (
    <div
      className={cn(
        "relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface-2",
        className,
      )}
    >
      {url ? (
        <Image src={url} alt={title} fill sizes={sizes} className="object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-2 via-surface-1 to-canvas p-4 text-center">
          <Clapperboard
            className="size-10 text-text-muted/40"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <span className="font-serif text-base font-medium leading-tight text-text-secondary">
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
