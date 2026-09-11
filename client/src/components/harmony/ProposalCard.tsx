import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/taxonomy";
import { tone as toneClasses } from "./tone";
import { Surface } from "./primitives";

/* ============================================================== Media === */

/**
 * Cover image with the aspect ratio reserved before load, and a tinted
 * fallback tile when the URL is missing or broken.
 *
 * The pages previously used a raw <img> with an `onError` that set
 * display:none — the box collapsed, so every card jumped on a dead link.
 */
export function CardMedia({
  src,
  alt,
  icon: Icon,
  tone: t = "neutral",
  ratio = "16 / 9",
  overlay,
  className,
}: {
  src?: string | null;
  alt: string;
  icon: LucideIcon;
  tone?: Tone;
  ratio?: string;
  /** Rendered above the image, e.g. a score chip. */
  overlay?: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const c = toneClasses(t);
  const showFallback = !src || failed;

  return (
    <div
      className={cn("relative w-full overflow-hidden bg-muted", className)}
      style={{ aspectRatio: ratio }}
    >
      {showFallback ? (
        <div
          className={cn("flex size-full items-center justify-center", c.soft)}
        >
          <Icon
            className={cn("size-8 opacity-50", c.onSoft)}
            strokeWidth={1.5}
            aria-hidden
          />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
      {overlay && (
        <>
          {/* Scrim so an overlaid chip stays legible on any photo. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[var(--scrim)] to-transparent"
          />
          <div className="absolute right-2.5 top-2.5">{overlay}</div>
        </>
      )}
    </div>
  );
}

/* ======================================================= ProposalCard === */

export interface ProposalCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Rendered above the body; use `CardMedia`. */
  media?: ReactNode;
  /** Icon+text facts row (price, dates, location). */
  meta?: ReactNode;
  /** Pills shown next to the title. */
  badges?: ReactNode;
  /** Vote distribution bar. */
  bar?: ReactNode;
  /** The `VoteControl`. */
  vote?: ReactNode;
  /** Member avatars, usually grouped by stance. */
  voters?: ReactNode;
  /** Overflow menu trigger. */
  actions?: ReactNode;
  /** Comments, "lock this" actions — anything below the divider. */
  footer?: ReactNode;
  /** Extra body content, e.g. a collapsible AI panel. */
  children?: ReactNode;
  selected?: boolean;
  /** `condensed` is the dashboard's inline preview; `full` is the detail page. */
  density?: "full" | "condensed";
  onOpen?: () => void;
  className?: string;
}

export function ProposalCard({
  title,
  subtitle,
  media,
  meta,
  badges,
  bar,
  vote,
  voters,
  actions,
  footer,
  children,
  selected,
  density = "full",
  onOpen,
  className,
}: ProposalCardProps) {
  const condensed = density === "condensed";

  return (
    <Surface
      as="article"
      elevation={condensed ? 0 : 1}
      interactive={!!onOpen}
      selected={selected}
      className={cn("overflow-hidden", condensed && "rounded-xl", className)}
    >
      {media}

      <div className={cn(condensed ? "p-3" : "p-4")}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3
                className={cn(
                  "min-w-0 font-display font-bold tracking-tight",
                  condensed ? "text-[15px]" : "text-[17px]"
                )}
              >
                {onOpen ? (
                  <button
                    type="button"
                    onClick={onOpen}
                    className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  >
                    {title}
                  </button>
                ) : (
                  title
                )}
              </h3>
              {badges}
            </div>

            {subtitle && (
              <p
                className={cn(
                  "mt-1 text-sm text-muted-foreground",
                  // Clamp rather than truncate: two lines still communicate.
                  condensed ? "line-clamp-1" : "line-clamp-2"
                )}
              >
                {subtitle}
              </p>
            )}

            {meta && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {meta}
              </div>
            )}
          </div>

          {actions && <div className="-mr-1 -mt-1 shrink-0">{actions}</div>}
        </div>

        {children && (
          <div className={cn(condensed ? "mt-2.5" : "mt-3")}>{children}</div>
        )}

        {bar && (
          <div className={cn(condensed ? "mt-2.5" : "mt-3.5")}>{bar}</div>
        )}

        {(vote || voters) && (
          <div
            className={cn(
              "flex items-center gap-3",
              condensed ? "mt-2.5" : "mt-3.5"
            )}
          >
            {vote && <div className="min-w-0 flex-1">{vote}</div>}
            {voters}
          </div>
        )}
      </div>

      {footer && (
        <div className="border-t border-border/70 px-4 py-2.5">{footer}</div>
      )}
    </Surface>
  );
}
