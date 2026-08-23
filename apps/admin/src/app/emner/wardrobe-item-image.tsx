"use client";

import { useState } from "react";

type WardrobeItemImageProps = {
  alt: string;
  className?: string;
  imageClassName?: string;
  imageUrl: string | null;
  placeholderClassName?: string;
};

export function WardrobeItemImage({
  alt,
  className,
  imageClassName,
  imageUrl,
  placeholderClassName,
}: WardrobeItemImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const canShowImage = Boolean(imageUrl && failedUrl !== imageUrl);

  return (
    <span className={className}>
      {canShowImage ? (
        // The catalogue URL is dynamic, so Next Image cannot safely
        // declare its host ahead of time.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className={imageClassName}
          decoding="async"
          draggable={false}
          loading="lazy"
          onError={() => setFailedUrl(imageUrl)}
          src={imageUrl ?? undefined}
        />
      ) : (
        <span
          aria-label={`Billede mangler for ${alt}`}
          className={placeholderClassName}
          role="img"
        >
          Billede mangler
        </span>
      )}
    </span>
  );
}
