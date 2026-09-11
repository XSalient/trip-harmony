import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion vocabulary (MASTER §7).
 *
 * Everything animates transform/opacity only, exits run shorter than entrances,
 * and all of it degrades to a plain fade under prefers-reduced-motion — see
 * `useReducedMotionSafe` below.
 */

export const SPRING: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 32,
  mass: 0.7,
};
export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 30,
};

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN = [0.7, 0, 0.84, 0] as const;

export const DURATION = { fast: 0.15, base: 0.22, slow: 0.32 } as const;

/**
 * Standard entrance for CONTENT: a small rise, transform only.
 *
 * Deliberately does not animate opacity. An element that starts at opacity 0
 * is invisible until its animation completes, and requestAnimationFrame is
 * throttled in background tabs, low-power mode and some in-app webviews — so a
 * fade-in entrance can leave real content permanently blank. Transform-only
 * degrades to "already in the right place", which is always readable.
 *
 * Opacity fades are still fine for overlays and transient chrome (see fadeIn),
 * where nothing is lost if the element never appears.
 */
export const riseIn: Variants = {
  hidden: { y: 14 },
  show: { y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { y: 6, transition: { duration: DURATION.fast, ease: EASE_IN } },
};

/** Scale-in for medallions and badges. Transform only, same rule as riseIn. */
export const popIn: Variants = {
  hidden: { scale: 0.9 },
  show: { scale: 1, transition: SPRING },
  exit: { scale: 0.96, transition: { duration: DURATION.fast } },
};

/** Plain cross-fade — the reduced-motion fallback for everything above. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

/**
 * Stagger container. Capped at 8 children's worth of delay so a long list
 * never leaves the last card waiting (MASTER §7).
 */
export function stagger(step = 0.04, delay = 0): Variants {
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren: step,
        delayChildren: delay,
        staggerDirection: 1,
      },
    },
  };
}

/** Press feedback that never shifts layout. */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: SPRING,
} as const;

/**
 * Directional slide for step flows (quiz, wizards). Forward enters from the
 * right, back from the left, so motion matches navigation direction.
 */
export const slideVariants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 32 : -32 }),
  center: { x: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: (dir: number) => ({
    x: dir > 0 ? -32 : 32,
    transition: { duration: DURATION.fast, ease: EASE_IN },
  }),
};
