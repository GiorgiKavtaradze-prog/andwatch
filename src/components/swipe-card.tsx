"use client";

import { Heart, X } from "lucide-react";
import {
  motion,
  type PanInfo,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useState } from "react";
import type { Movie } from "@/lib/catalog/types";
import { DURATION, EASE, SWIPE_SPRING } from "@/lib/motion";
import { PosterImage } from "./poster-image";

export interface SwipeCardProps {
  movie: Movie;
  onLike: () => void;
  onDislike: () => void;
}

const SWIPE_THRESHOLD = 120;
const FLY_DISTANCE = 640;

export function SwipeCard({ movie, onLike, onDislike }: SwipeCardProps) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-FLY_DISTANCE, 0, FLY_DISTANCE], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [40, SWIPE_THRESHOLD], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_THRESHOLD, -40], [1, 0]);
  const controls = useAnimationControls();
  const [announcement, setAnnouncement] = useState("");
  const [decided, setDecided] = useState(false);

  async function decide(direction: "like" | "dislike") {
    if (decided) return;
    setDecided(true);
    setAnnouncement(direction === "like" ? `Liked ${movie.title}` : `Passed on ${movie.title}`);

    if (reduceMotion) {
      await controls.start({ opacity: 0, transition: { duration: DURATION.base } });
    } else {
      await controls.start({
        x: direction === "like" ? FLY_DISTANCE : -FLY_DISTANCE,
        opacity: 0,
        transition: { duration: DURATION.slow, ease: EASE.standard },
      });
    }

    if (direction === "like") onLike();
    else onDislike();
  }

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      decide("like");
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      decide("dislike");
    } else {
      controls.start({ x: 0, rotate: 0, transition: SWIPE_SPRING });
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-full max-w-xs">
        <motion.div
          className="relative touch-none overflow-hidden rounded-lg border border-border bg-surface-1 shadow-e2"
          style={reduceMotion ? { x } : { x, rotate }}
          drag={reduceMotion ? false : "x"}
          dragElastic={0.6}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
          animate={controls}
          whileTap={reduceMotion ? undefined : { cursor: "grabbing" }}
        >
          <PosterImage
            posterPath={movie.poster_path}
            title={movie.title}
            className="rounded-none"
          />

          {/* Like / nope drag hints (shown only while dragging, so reduced-motion users never see them) */}
          {!reduceMotion && (
            <>
              <motion.span
                aria-hidden="true"
                style={{ opacity: likeOpacity }}
                className="pointer-events-none absolute left-4 top-4 rounded-md border-2 border-success px-3 py-1 font-sans text-sm font-bold uppercase tracking-wide text-success"
              >
                Like
              </motion.span>
              <motion.span
                aria-hidden="true"
                style={{ opacity: nopeOpacity }}
                className="pointer-events-none absolute right-4 top-4 rounded-md border-2 border-danger px-3 py-1 font-sans text-sm font-bold uppercase tracking-wide text-danger"
              >
                Nope
              </motion.span>
            </>
          )}

          <div className="flex flex-col gap-1 p-4">
            <h3 className="font-serif text-xl font-medium leading-tight text-text">
              {movie.title}
            </h3>
            {movie.release_year != null && (
              <span className="font-sans text-sm text-text-secondary">{movie.release_year}</span>
            )}
          </div>
        </motion.div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => decide("dislike")}
          aria-label={`Dislike ${movie.title}`}
          disabled={decided}
          className="inline-flex size-14 items-center justify-center rounded-full border border-border bg-surface-1 text-danger outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-2 hover:border-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50"
        >
          <X className="size-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => decide("like")}
          aria-label={`Like ${movie.title}`}
          disabled={decided}
          className="inline-flex size-14 items-center justify-center rounded-full border border-border bg-surface-1 text-success outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-2 hover:border-success focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50"
        >
          <Heart className="size-6" aria-hidden="true" />
        </button>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
