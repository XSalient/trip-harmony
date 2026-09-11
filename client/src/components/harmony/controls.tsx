import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/taxonomy";
import { tone as toneClasses } from "./tone";
import { IconTile } from "./primitives";
import { haptic } from "@/lib/haptics";

/* =========================================================== ChipPicker === */

export interface ChipOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Selectable chips, single or multiple. Replaces three separate hand-rolled
 * pickers (raw buttons in VibeBoard, clickable Badges in Destinations).
 *
 * Scrolls horizontally in its own container when `scroll` is set, so a long
 * row never makes the page scroll sideways (MASTER §5).
 */
export function ChipPicker({
  options,
  value,
  onChange,
  multiple,
  tone: t = "primary",
  scroll,
  size = "md",
  className,
  label,
}: {
  options: ChipOption[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  tone?: Tone;
  scroll?: boolean;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const c = toneClasses(t);

  const toggle = (v: string) => {
    if (!multiple) return onChange(value.includes(v) ? [] : [v]);
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  };

  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
      className={cn(
        "flex gap-2",
        scroll
          ? "-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "flex-wrap",
        className
      )}
    >
      {options.map(opt => {
        const active = value.includes(opt.value);
        return (
          <motion.button
            key={opt.value}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={active}
            onClick={() => {
              haptic("select");
              toggle(opt.value);
            }}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              size === "md"
                ? "min-h-10 px-3.5 text-sm touch-target"
                : "min-h-9 px-3 text-[13px] touch-target",
              active
                ? cn(c.soft, c.onSoft, "border-transparent")
                : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
            )}
          >
            {active ? (
              <Check className="size-3.5 shrink-0" strokeWidth={2.5} />
            ) : (
              opt.icon && (
                <opt.icon className="size-3.5 shrink-0" strokeWidth={2} />
              )
            )}
            {opt.label}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ====================================================== StickyActionBar === */

/**
 * Sticky footer for form screens. Offset by the shared --nav-height token plus
 * the safe-area inset, which is what TripPreferences got wrong by guessing
 * `bottom-14` against a 64px nav.
 */
export function StickyActionBar({
  children,
  visible = true,
  className,
}: {
  children: ReactNode;
  visible?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 120, opacity: visible ? 1 : 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 400, damping: 34 }
      }
      className={cn(
        "fixed inset-x-0 bottom-nav z-30 px-4 lg:static lg:px-0 lg:pb-0",
        className
      )}
    >
      <div className="glass mx-auto flex max-w-2xl items-center gap-2 rounded-2xl p-2 shadow-e3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-filter-none">
        {children}
      </div>
    </motion.div>
  );
}

/* ================================================================= Fab === */

/**
 * The floating primary action. Replaces "New Trip" as a bottom-nav tab —
 * creating something is an action, not a destination.
 */
export function Fab({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic("impact");
        onClick();
      }}
      aria-label={label}
      // Scale only. An opacity entrance leaves the control invisible if the
      // animation never runs (throttled rAF in a background tab or low-power
      // mode) — and this is the screen's primary action.
      initial={reduce ? false : { scale: 0.85 }}
      animate={{ scale: 1 }}
      whileTap={reduce ? undefined : { scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "fixed bottom-nav right-4 z-40 inline-flex min-h-14 items-center gap-2 rounded-full grad-brand px-5",
        "font-display text-[15px] font-bold text-primary-foreground shadow-e3",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <Icon className="size-5" strokeWidth={2.5} aria-hidden />
      <span>{label}</span>
    </motion.button>
  );
}

/* ======================================================== StatusScreen === */

/**
 * The shell-less full-screen state shared by 404 and magic-link verification.
 * Depends on nothing but tokens, so it still renders when the app around it
 * has failed.
 */
export function StatusScreen({
  icon,
  tone: t = "neutral",
  title,
  description,
  action,
  secondaryAction,
  spinning,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Spins the glyph — the one continuous animation this screen allows. */
  spinning?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="screen-forward flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 safe-area-top safe-area-bottom">
      <motion.div
        initial={reduce ? false : { scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      >
        <IconTile
          icon={icon}
          tone={t}
          size="xl"
          iconClassName={spinning ? "animate-spin" : undefined}
        />
      </motion.div>

      <motion.div
        initial={reduce ? false : { y: 10 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.06, duration: 0.22 }}
        className="max-w-[34ch] space-y-2 text-center"
      >
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[15px] text-muted-foreground">{description}</p>
        )}
      </motion.div>

      {(action || secondaryAction) && (
        <motion.div
          initial={reduce ? false : { y: 10 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.12, duration: 0.22 }}
          className="flex w-full max-w-xs flex-col items-center gap-2"
        >
          {action}
          {secondaryAction}
        </motion.div>
      )}
    </div>
  );
}
