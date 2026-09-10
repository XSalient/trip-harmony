import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/taxonomy";
import { tone as toneClasses } from "./tone";
import { IconTile, Surface } from "./primitives";

/* ============================================================ StatCard === */

export interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  value?: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  /** Count badge, e.g. outstanding votes. */
  badge?: number;
  onClick?: () => void;
  /** Renders a chevron to signal navigation. */
  navigational?: boolean;
  className?: string;
}

/**
 * The app's summary tile. Used for dashboard counters, budget figures and the
 * "needs you" prompts — replacing several one-off gradient cards.
 */
export function StatCard({
  icon,
  label,
  value,
  hint,
  tone: t = "neutral",
  badge,
  onClick,
  navigational,
  className,
}: StatCardProps) {
  const c = toneClasses(t);
  const emphasised = t !== "neutral";

  return (
    <Surface
      elevation={1}
      interactive={!!onClick}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3.5",
        emphasised && cn(c.soft, "border-transparent"),
        className
      )}
    >
      {icon && <IconTile icon={icon} tone={t} size="md" />}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[13px] font-medium",
            emphasised ? c.onSoft : "text-muted-foreground"
          )}
        >
          {label}
        </p>
        {value != null && (
          <p
            className={cn(
              "mt-0.5 truncate font-display text-xl font-bold tabular tracking-tight",
              emphasised && c.onSoft
            )}
          >
            {value}
          </p>
        )}
        {hint && (
          <p className={cn("mt-0.5 text-xs", emphasised ? cn(c.onSoft, "opacity-80") : "text-muted-foreground")}>
            {hint}
          </p>
        )}
      </div>

      {badge != null && badge > 0 && (
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular",
            c.solid,
            c.onSolid
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}

      {navigational && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </Surface>
  );
}

/* ========================================================= SectionCard === */

export interface SectionCardProps {
  title: ReactNode;
  icon?: LucideIcon;
  description?: ReactNode;
  count?: number;
  tone?: Tone;
  /** Rendered in the header, right-aligned (a badge, an add button). */
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * A titled container with an optional collapse. Replaces three hand-rolled
 * expanders (raw buttons plus a conditional div) across the app.
 */
export function SectionCard({
  title,
  icon,
  description,
  count,
  tone: t = "neutral",
  action,
  collapsible,
  defaultOpen = true,
  children,
  footer,
  className,
  bodyClassName,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const c = toneClasses(t);
  const expanded = collapsible ? open : true;

  const header = (
    <div className="flex items-center gap-3">
      {icon && <IconTile icon={icon} tone={t} size="md" />}
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate font-display text-[15px] font-bold tracking-tight">{title}</h3>
          {count != null && (
            <span className="tabular text-sm font-medium text-muted-foreground">{count}</span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {collapsible && (
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
          aria-hidden
        />
      )}
    </div>
  );

  return (
    <Surface
      elevation={1}
      className={cn("overflow-hidden", t !== "neutral" && cn(c.border), className)}
    >
      <div className={cn("p-4", expanded && "pb-3")}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={expanded}
            className="w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            {header}
          </button>
        ) : (
          header
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className={cn("px-4 pb-4", bodyClassName)}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {footer && expanded && (
        <div className="border-t border-border/70 px-4 py-2.5">{footer}</div>
      )}
    </Surface>
  );
}

/* ============================================================== Meter === */

/**
 * A labelled progress meter. Segments carry their own labels so the reading
 * never depends on colour (budget health, quiz progress, fit scores).
 */
export function Meter({
  value,
  max = 100,
  tone: t = "primary",
  label,
  valueLabel,
  markerAt,
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  label?: ReactNode;
  valueLabel?: ReactNode;
  /** Draws a threshold marker, e.g. the budget limit at 100%. */
  markerAt?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const c = toneClasses(t);
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || valueLabel) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && <span className="text-[13px] text-muted-foreground">{label}</span>}
          {valueLabel && (
            <span className="tabular text-[13px] font-semibold">{valueLabel}</span>
          )}
        </div>
      )}
      <div
        className={cn("relative w-full overflow-hidden rounded-full bg-muted", size === "md" ? "h-2.5" : "h-1.5")}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === "string" ? label : "Progress"}
      >
        <motion.span
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={cn("absolute inset-y-0 left-0 rounded-full", c.solid)}
        />
        {markerAt != null && markerAt < 100 && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-foreground/40"
            style={{ left: `${markerAt}%` }}
          />
        )}
      </div>
    </div>
  );
}
