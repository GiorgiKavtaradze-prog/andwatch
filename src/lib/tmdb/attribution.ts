export const TMDB_ATTRIBUTION_NOTICE =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";

export const TMDB_HOME_URL = "https://www.themoviedb.org/";

// TMDB brand assets are hosted by TMDB. The UI should render the logo linking to TMDB_HOME_URL.
export const TMDB_LOGO_URL =
  "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg";

// Base URL for movie images. A movies.poster_path like "/abc.jpg" becomes
// `${TMDB_IMAGE_BASE}/w500/abc.jpg`. Sizes: w200, w300, w500, original.
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(
  posterPath: string | null,
  size = "w500",
): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}/${size}${posterPath}` : null;
}
