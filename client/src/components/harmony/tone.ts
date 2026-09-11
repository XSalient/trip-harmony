import type { Tone } from "@/lib/taxonomy";

/**
 * The single place a semantic tone becomes CSS classes.
 *
 * MASTER §2.4: pages never write `text-success` on arbitrary markup — they
 * pass `tone="success"` to a component, and that component resolves it here.
 * Keeping the mapping in one table is also what makes the class strings
 * statically visible to Tailwind (it cannot see `bg-${tone}-soft`).
 */
export interface ToneClasses {
  /** Tinted surface — icon tiles, callouts, chips. */
  soft: string;
  /** Text on that tinted surface. */
  onSoft: string;
  /** Solid fill — meters, bars, dots. */
  solid: string;
  /** Text/icon on the solid fill. */
  onSolid: string;
  /** Standalone coloured text on a neutral surface. */
  text: string;
  /** Border matched to the tone. */
  border: string;
  /** Ring for focus/selection in this tone. */
  ring: string;
}

export const TONES: Record<Tone, ToneClasses> = {
  neutral: {
    soft: "bg-muted",
    onSoft: "text-muted-foreground",
    solid: "bg-muted-foreground",
    onSolid: "text-background",
    text: "text-muted-foreground",
    border: "border-border",
    ring: "ring-border",
  },
  primary: {
    soft: "bg-primary/12",
    onSoft: "text-primary",
    solid: "bg-primary",
    onSolid: "text-primary-foreground",
    text: "text-primary",
    border: "border-primary/30",
    ring: "ring-primary",
  },
  success: {
    soft: "bg-success-soft",
    onSoft: "text-success-on-soft",
    solid: "bg-success",
    onSolid: "text-success-foreground",
    text: "text-success",
    border: "border-success-border",
    ring: "ring-success",
  },
  warning: {
    soft: "bg-warning-soft",
    onSoft: "text-warning-on-soft",
    solid: "bg-warning",
    onSolid: "text-warning-foreground",
    text: "text-warning",
    border: "border-warning-border",
    ring: "ring-warning",
  },
  danger: {
    soft: "bg-danger-soft",
    onSoft: "text-danger-on-soft",
    solid: "bg-danger",
    onSolid: "text-danger-foreground",
    text: "text-danger",
    border: "border-danger-border",
    ring: "ring-danger",
  },
  info: {
    soft: "bg-info-soft",
    onSoft: "text-info-on-soft",
    solid: "bg-info",
    onSolid: "text-info-foreground",
    text: "text-info",
    border: "border-info-border",
    ring: "ring-info",
  },
  "cat-1": {
    soft: "bg-cat-1-soft",
    onSoft: "text-cat-1-on-soft",
    solid: "bg-cat-1",
    onSolid: "text-cat-1-foreground",
    text: "text-cat-1",
    border: "border-cat-1-soft",
    ring: "ring-cat-1",
  },
  "cat-2": {
    soft: "bg-cat-2-soft",
    onSoft: "text-cat-2-on-soft",
    solid: "bg-cat-2",
    onSolid: "text-cat-2-foreground",
    text: "text-cat-2",
    border: "border-cat-2-soft",
    ring: "ring-cat-2",
  },
  "cat-3": {
    soft: "bg-cat-3-soft",
    onSoft: "text-cat-3-on-soft",
    solid: "bg-cat-3",
    onSolid: "text-cat-3-foreground",
    text: "text-cat-3",
    border: "border-cat-3-soft",
    ring: "ring-cat-3",
  },
  "cat-4": {
    soft: "bg-cat-4-soft",
    onSoft: "text-cat-4-on-soft",
    solid: "bg-cat-4",
    onSolid: "text-cat-4-foreground",
    text: "text-cat-4",
    border: "border-cat-4-soft",
    ring: "ring-cat-4",
  },
  "cat-5": {
    soft: "bg-cat-5-soft",
    onSoft: "text-cat-5-on-soft",
    solid: "bg-cat-5",
    onSolid: "text-cat-5-foreground",
    text: "text-cat-5",
    border: "border-cat-5-soft",
    ring: "ring-cat-5",
  },
  "cat-6": {
    soft: "bg-cat-6-soft",
    onSoft: "text-cat-6-on-soft",
    solid: "bg-cat-6",
    onSolid: "text-cat-6-foreground",
    text: "text-cat-6",
    border: "border-cat-6-soft",
    ring: "ring-cat-6",
  },
};

export function tone(t: Tone = "neutral"): ToneClasses {
  return TONES[t] ?? TONES.neutral;
}
