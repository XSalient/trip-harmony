import { Children, forwardRef, isValidElement, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/taxonomy";
import { tone as toneClasses } from "./tone";

/**
 * No framer-motion in this file, deliberately.
 *
 * Home is eagerly imported by App.tsx (it is what an unauthenticated visitor
 * lands on), so anything Home reaches pulls into the entry chunk — which is
 * precisely what master's route-splitting work stripped out. These primitives
 * animate with CSS instead; the heavier interactions that genuinely need a
 * physics engine live in the lazily-loaded trip components.
 */

/* ============================================================ IconTile === */

const TILE_SIZES = {
  sm: "size-8 rounded-lg [&>svg]:size-4",
  md: "size-10 rounded-xl [&>svg]:size-5",
  lg: "size-12 rounded-2xl [&>svg]:size-6",
  xl: "size-16 rounded-[1.25rem] [&>svg]:size-8",
} as const;

export function IconTile({
  icon: Icon,
  tone: t = "neutral",
  size = "md",
  solid,
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof TILE_SIZES;
  /** Filled treatment for hero moments; default is the tinted surface. */
  solid?: boolean;
  className?: string;
  /** Applied to the glyph itself — e.g. animate-spin for a loading state. */
  iconClassName?: string;
}) {
  const c = toneClasses(t);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        TILE_SIZES[size],
        solid ? cn(c.solid, c.onSolid) : cn(c.soft, c.onSoft),
        className
      )}
    >
      <Icon strokeWidth={2} className={iconClassName} />
    </span>
  );
}

/* =========================================================== StatusPill === */

export function StatusPill({
  tone: t = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  const c = toneClasses(t);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium leading-none",
        c.soft,
        c.onSoft,
        className
      )}
    >
      {/* Icon plus text: a pill never relies on colour alone (MASTER §1). */}
      {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2.25} />}
      {children}
    </span>
  );
}

/* ================================================================ Meta === */

/** A small icon+text fact, e.g. "4 beds", "£120/night", "Lisbon". */
export function Meta({
  icon: Icon,
  children,
  numeric,
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  /** Use tabular figures so the value does not reflow as it changes. */
  numeric?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] text-muted-foreground",
        numeric && "tabular",
        className
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2} />}
      {children}
    </span>
  );
}

/* ============================================================ Surface === */

/**
 * The app's card. Deliberately not shadcn's Card: this one owns the elevation
 * scale, the interactive affordances and the press feedback, so every surface
 * in the app is consistent by construction.
 */
export interface SurfaceProps {
  children: ReactNode;
  className?: string;
  /** Resting elevation. Interactive surfaces lift by one on hover. */
  elevation?: 0 | 1 | 2 | 3;
  interactive?: boolean;
  selected?: boolean;
  tone?: Tone;
  /**
   * `solid`   — an opaque card. The default, and correct for list content.
   * `glass`   — translucent + blurred. Only where there is content behind it
   *             (bars, sheets, overlays); blur is meaning, not decoration.
   * `gradient`— a subtle two-stop surface wash, for hero/summary cards.
   */
  variant?: "solid" | "glass" | "gradient";
  onClick?: () => void;
  as?: "div" | "article" | "li";
  "aria-label"?: string;
}

const ELEVATION = ["", "shadow-e1", "shadow-e2", "shadow-e3"] as const;

const VARIANT = {
  solid: "bg-card",
  glass: "glass",
  gradient: "grad-surface",
} as const;

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { children, className, elevation = 1, interactive, selected, tone: t,
    variant = "solid", onClick, as = "div", ...rest },
  ref
) {
  const c = t ? toneClasses(t) : null;
  const Comp = as;

  return (
    <Comp
      ref={ref as never}
      // Whole-card activation needs real button semantics, not just onClick.
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      className={cn(
        "relative rounded-2xl text-card-foreground",
        // Glass brings its own border; the others get the standard hairline.
        variant === "glass" ? VARIANT.glass : cn("border", VARIANT[variant]),
        ELEVATION[elevation],
        selected ? cn("border-transparent ring-2", c?.ring ?? "ring-primary") : "border-border/70",
        t && !selected && c?.border,
        interactive &&
          "transition-[box-shadow,transform] duration-200 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        onClick && "active:scale-[0.99] motion-reduce:active:scale-100",
        className
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
});

/* ========================================================== EmptyState === */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center",
        size === "sm" ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className
      )}
    >
      <IconTile icon={Icon} size={size === "sm" ? "md" : "lg"} tone="neutral" />
      <div className="space-y-1">
        <p className={cn("font-display font-bold", size === "sm" ? "text-base" : "text-lg")}>
          {title}
        </p>
        {description && (
          <p className="mx-auto max-w-[36ch] text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/* ========================================================== SectionHead === */

export function SectionHead({
  title,
  count,
  action,
  className,
}: {
  title: ReactNode;
  count?: number;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-1", className)}>
      <h2 className="font-display text-[17px] font-bold tracking-tight">
        {title}
        {count != null && (
          <span className="ml-1.5 tabular text-sm font-medium text-muted-foreground">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

/* ============================================================ Stagger === */

/**
 * Staggers its children in. Each child is handed its index as a `--i` custom
 * property, which the `stagger-item` utility turns into an animation-delay,
 * capped so a long list never leaves the last card waiting.
 */
export function StaggerList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) =>
        isValidElement<{ style?: React.CSSProperties }>(child)
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ ...child, props: { ...child.props, style: { ...child.props.style, ["--i" as never]: i } } } as never)
          : child
      )}
    </div>
  );
}

export function StaggerItem({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("stagger-item", className)} style={style}>
      {children}
    </div>
  );
}

/* ============================================================ PageGrid === */

/**
 * One column on mobile, two from `lg`. Every screen composes its sections as
 * PageGrid children even though it is a no-op on phones — that is what keeps
 * the desktop pass a matter of tuning rather than restructuring (MASTER §5).
 */
export function PageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full grid-cols-1 gap-4 px-4 py-4 sm:px-5 lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-5",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A PageGrid child that spans both columns on desktop. */
export function GridSpan({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("lg:col-span-2", className)}>{children}</div>;
}
