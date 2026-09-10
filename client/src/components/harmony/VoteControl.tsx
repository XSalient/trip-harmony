import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  STANCES, STANCE_TONE, stanceOf, type Tally, type VoteScale, type VoteStance,
} from "@/lib/voting";
import { tone as toneClasses } from "./tone";

/* ========================================================= VoteControl === */

interface VoteControlProps<W extends string> {
  scale: VoteScale<W>;
  /** The current user's vote, in wire form. */
  value?: W | null;
  /** `isUnvote` is decided here, not at the call site. */
  onVote: (wire: W, isUnvote: boolean) => void;
  size?: "sm" | "md";
  /** `labeled` shows words; `icon` is for dense rows and narrow cards. */
  layout?: "labeled" | "icon";
  disabled?: boolean;
  pending?: boolean;
  className?: string;
}

export function VoteControl<W extends string>({
  scale,
  value,
  onVote,
  size = "md",
  layout = "labeled",
  disabled,
  pending,
  className,
}: VoteControlProps<W>) {
  const current = stanceOf(scale, value);
  const reduce = useReducedMotion();

  return (
    <div
      role="radiogroup"
      aria-label="Your vote"
      aria-busy={pending || undefined}
      className={cn(
        "flex items-stretch gap-1.5 rounded-full bg-muted/60 p-1",
        layout === "icon" && "w-fit",
        className
      )}
    >
      {STANCES.map(stance => {
        const wire = scale.values[stance];
        const active = current === stance;
        const c = toneClasses(STANCE_TONE[stance]);
        const Icon = scale.icons[stance];
        // Always render the short label. Three buttons across a 390px screen
        // cannot fit "Can't make it" without truncating, and truncation is a
        // worse failure than brevity. The full phrasing stays as the
        // accessible name below.
        const label = scale.shortLabels[stance];

        return (
          <motion.button
            key={stance}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={scale.labels[stance]}
            disabled={disabled}
            whileTap={reduce || disabled ? undefined : { scale: 0.94 }}
            onClick={() => onVote(wire, active)}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50",
              // >=44px on mobile even in the compact layout.
              size === "md" ? "min-h-11 flex-1 px-3 text-sm" : "min-h-10 flex-1 px-2.5 text-[13px]",
              layout === "icon" && "min-w-11 flex-none px-3",
              active
                ? cn(c.soft, c.onSoft, "shadow-e1")
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            )}
          >
            <Icon
              className={cn(size === "md" ? "size-4" : "size-3.5", "shrink-0")}
              strokeWidth={active ? 2.5 : 2}
              // Filled heart/check reads as "chosen" without relying on colour.
              fill={active && stance === "up" && scale.id === "preference" ? "currentColor" : "none"}
            />
            {layout === "labeled" && <span className="truncate">{label}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ============================================================= VoteBar === */

/**
 * Proportional yes/maybe/no bar. Each segment carries its count as text, so
 * the distribution is legible without colour vision (MASTER §1 rule 6).
 */
export function VoteBar({
  tally,
  memberCount,
  scale,
  className,
  showLegend = true,
}: {
  tally: Tally;
  memberCount?: number;
  scale: VoteScale<string>;
  className?: string;
  showLegend?: boolean;
}) {
  const reduce = useReducedMotion();
  const total = Math.max(tally.total, 1);
  const pending = Math.max(0, (memberCount ?? tally.total) - tally.total);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          `${tally.up} ${scale.shortLabels.up}, ` +
          `${tally.mid} ${scale.shortLabels.mid}, ` +
          `${tally.down} ${scale.shortLabels.down}` +
          (pending ? `, ${pending} not voted` : "")
        }
      >
        {STANCES.map(stance => {
          const n = tally[stance];
          if (!n) return null;
          const c = toneClasses(STANCE_TONE[stance]);
          return (
            <motion.span
              key={stance}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${(n / total) * 100}%` }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className={cn("h-full", c.solid)}
            />
          );
        })}
      </div>

      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {STANCES.map(stance => {
            const c = toneClasses(STANCE_TONE[stance]);
            return (
              <span
                key={stance}
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"
              >
                <span className={cn("size-1.5 rounded-full", c.solid)} aria-hidden />
                <span className="tabular font-medium text-foreground">{tally[stance]}</span>
                {scale.shortLabels[stance]}
              </span>
            );
          })}
          {pending > 0 && (
            <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground/30" aria-hidden />
              <span className="tabular font-medium">{pending}</span> waiting
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================== ScoreChip === */

/** Signed group score. Sign is shown as text, so tone is reinforcement only. */
export function ScoreChip({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const t = score > 0 ? "success" : score < 0 ? "danger" : "neutral";
  const c = toneClasses(t);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-full px-2.5 py-1",
        c.soft,
        c.onSoft,
        className
      )}
    >
      <span className="tabular text-base font-bold leading-none">
        {score > 0 ? `+${score}` : score}
      </span>
      <span className="text-[11px] font-medium opacity-80">score</span>
    </span>
  );
}

export type { VoteStance };
