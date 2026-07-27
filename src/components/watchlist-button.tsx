"use client";

// Add/remove-from-watchlist button (features 11 + 12). Optimistic: flips immediately, persists
// through setWatchlist, and reverts with a toast on failure. Used on the detail page and anywhere
// a labelled watchlist control is wanted (the recommendation-card has its own compact icon toggle).

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { setWatchlist } from "@/app/watchlist/actions";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toast";

export function WatchlistButton({
  movieId,
  title,
  initialInWatchlist,
}: {
  movieId: number;
  title: string;
  initialInWatchlist: boolean;
}) {
  const [inWatchlist, setInWatchlist] = useState(initialInWatchlist);
  const [pending, setPending] = useState(false);

  const toggle = useCallback(async () => {
    const next = !inWatchlist;
    setInWatchlist(next);
    setPending(true);
    const res = await setWatchlist(movieId, next);
    setPending(false);
    if (res.status === "error") {
      setInWatchlist(!next); // revert
      toastError("Could not update your watchlist", res.message);
    }
  }, [inWatchlist, movieId]);

  const Icon = inWatchlist ? BookmarkCheck : Bookmark;
  return (
    <Button
      variant={inWatchlist ? "secondary" : "primary"}
      onClick={toggle}
      disabled={pending}
      aria-pressed={inWatchlist}
      aria-label={inWatchlist ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
    >
      <Icon aria-hidden="true" />
      {inWatchlist ? "In your watchlist" : "Add to watchlist"}
    </Button>
  );
}
