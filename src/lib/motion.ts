export const DURATION = {
  instant: 0.08,
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
  reveal: 0.48,
} as const;

export const EASE = {
  standard: [0.2, 0, 0, 1] as [number, number, number, number],
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

// The swipe card's release spring.
export const SWIPE_SPRING = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

// Gentle enter reveal for cards and posters.
export const revealVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.reveal, ease: EASE.out },
  },
};
